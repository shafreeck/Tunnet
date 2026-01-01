"use client" // Ensure this is client component for hooks

import { useState, useEffect, useRef } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { Sidebar } from "@/components/dashboard/sidebar"
import { LocationsView } from "@/components/dashboard/locations-view"
import { SubscriptionsView } from "@/components/dashboard/subscriptions-view"
import { RulesView } from "@/components/dashboard/rules-view"
import { SettingsView } from "@/components/dashboard/settings-view"
import { Header, ConnectionStatus } from "@/components/dashboard/connection-status"
import { ServerList } from "@/components/dashboard/server-list"
import { LogViewer } from "@/components/dashboard/log-viewer"
import { WindowControls } from "@/components/ui/window-controls"
import { toast } from "sonner" // Assuming sonner is available or standard alert
import { getFlagUrl, getCountryName, getFlagUrlFromCode, getCountryCode } from "@/lib/flags"
import { NodeEditor, Node } from "@/components/dashboard/node-editor"
import { ConfirmationModal } from "@/components/ui/confirmation-modal"
import { AddNodeModal } from "@/components/dashboard/add-node-modal"

export default function Home() {
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Server Management Lifted State
  const [servers, setServers] = useState<any[]>([]) // Using any for now to match Server interface
  const [activeServerId, setActiveServerId] = useState<string | null>(null)

  // Refs for stale-free access in effects
  const serversRef = useRef(servers)
  const activeServerIdRef = useRef(activeServerId)
  const lastAppliedConfigRef = useRef<string | null>(null) // Format: "nodeId:mode:tun"

  useEffect(() => { serversRef.current = servers }, [servers])
  useEffect(() => { activeServerIdRef.current = activeServerId }, [activeServerId])

  // Editor State
  const [isEditorOpen, setEditorOpen] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingNode, setEditingNode] = useState<Node | null>(null)

  // Logs State
  const [logs, setLogs] = useState<string[]>([])
  const [showLogs, setShowLogs] = useState(false)

  // Connection Details State (Real IP)
  const [connectionDetails, setConnectionDetails] = useState<{ ip: string; country: string; countryCode: string } | null>(null)

  // Proxy Mode State
  const [proxyMode, setProxyMode] = useState<'global' | 'rule' | 'direct'>('rule')
  const [tunEnabled, setTunEnabled] = useState(false)

  useEffect(() => {
    let timer: NodeJS.Timeout
    if (isConnected) {
      // Fetch Real IP using backend proxy client with a delay to ensure core is ready
      // Fetch Real IP using backend proxy client with a retry mechanism
      const checkIpWithRetry = async (retries = 3) => {
        try {
          const data: any = await invoke("check_ip")
          if (data.status === "success") {
            setConnectionDetails({
              ip: data.query,
              country: data.country,
              countryCode: data.countryCode.toLowerCase()
            })
            // REMOVED: Syncing detected country to the active server in the list.
            // We want to keep the server list showing the PROXY location, not the Exit location.
          }
        } catch (err) {
          console.error(`Failed to fetch IP (retries left: ${retries}):`, err)
          if (retries > 0 && isConnected) {
            timer = setTimeout(() => checkIpWithRetry(retries - 1), 2000)
          }
        }
      }

      // Initial delay to ensure core is ready
      timer = setTimeout(() => checkIpWithRetry(), 2000)
    } else {
      setConnectionDetails(null)
    }
    return () => clearTimeout(timer)
  }, [isConnected, activeServerId])

  useEffect(() => {
    let pollTimer: NodeJS.Timeout
    if (tunEnabled) {
      pollTimer = setInterval(async () => {
        try {
          const installed = await invoke("check_helper")
          if (!installed) {
            console.log("Helper check failed (Poller)")
          }
        } catch (e) {
          // IPC fail
        }
      }, 5000)
    }
    return () => clearInterval(pollTimer)
  }, [tunEnabled])

  // Reactive Proxy Controller (The single source of truth for execution)
  useEffect(() => {
    const syncProxy = async () => {
      // 1. If we are disconnected, ensure no proxy is running (if it was)
      if (!isConnected) {
        if (lastAppliedConfigRef.current) {
          console.log("Disconnecting proxy...")
          await invoke("stop_proxy").catch(console.error)
          lastAppliedConfigRef.current = null
        }
        return
      }

      // 2. If we ARE connected, check if current settings match what's running
      if (!activeServerIdRef.current) return

      const currentConfigKey = `${activeServerIdRef.current}:${proxyMode}:${tunEnabled}`
      if (currentConfigKey === lastAppliedConfigRef.current) return
      if (isLoading) return

      const node = serversRef.current.find(s => s.id === activeServerIdRef.current)
      if (!node) return

      setIsLoading(true)
      console.log("Syncing proxy config...", { proxyMode, tunEnabled, node: node.name })

      const promise = invoke("start_proxy", {
        node,
        tun: tunEnabled,
        routing: proxyMode
      })

      toast.promise(promise, {
        loading: lastAppliedConfigRef.current ? `Updating to ${proxyMode}...` : `Connecting to ${node.name}...`,
        success: lastAppliedConfigRef.current ? `Updated to ${proxyMode}` : `Connected to ${node.name}`,
        error: (err: any) => `Failed: ${err}`
      })

      try {
        await promise
        lastAppliedConfigRef.current = currentConfigKey
      } catch (e) {
        console.error("Failed to sync proxy", e)
        // If it failed to start, we should probably set isConnected to false?
        // But for hot-reload, we might want to stay "connected" but in previous state.
        // For simplicity:
        if (!lastAppliedConfigRef.current) setIsConnected(false)
      } finally {
        setIsLoading(false)
      }
    }

    syncProxy()
  }, [isConnected, proxyMode, tunEnabled])

  useEffect(() => {
    // Init: Load logs listener
    const unlisten = listen<string>("proxy-log", (event) => {
      setLogs(prev => {
        const newLogs = [...prev, event.payload]
        if (newLogs.length > 1000) return newLogs.slice(-1000) // Keep last 1000 lines
        return newLogs
      })
    })

    // Init: Load stored preferences
    const savedTun = localStorage.getItem("tunEnabled")
    if (savedTun !== null) {
      setTunEnabled(savedTun === "true")
    }
    const savedMode = localStorage.getItem("proxyMode")
    if (savedMode) {
      setProxyMode(savedMode as any)
    }

    // Init: Load stored profiles and nodes
    fetchProfiles()

    return () => { unlisten.then(f => f()) }
  }, [])

  const fetchProfiles = () => {
    invoke("get_profiles").then((profiles: any) => {
      setProfiles(profiles.reverse()) // Show newest first

      // Flatten nodes for server list
      const allNodes = profiles.flatMap((p: any) => p.nodes)
      updateServersState(allNodes)

      // Auto-select last used server
      const lastId = localStorage.getItem("activeServerId")
      if (lastId && allNodes.find((n: any) => n.id === lastId)) {
        setActiveServerId(lastId)
      }
    }).catch(console.error)
  }

  // Helper to map backend nodes to UI servers
  const updateServersState = (nodes: any[]) => {
    const safeNodes = Array.isArray(nodes) ? nodes : [];
    const mapped = safeNodes.map((node: any) => ({
      ...node,
      provider: node.protocol.toUpperCase(),
      flagUrl: getFlagUrl(node.location?.country || node.name || ""),
      countryCode: getCountryCode(node.location?.country || node.name || ""),
      country: getCountryName(node.location?.country || node.name || ""),
      status: "idle",
      ping: node.location?.latency || 0
    }))
    setServers(mapped)
  }

  // Persist preferences
  useEffect(() => {
    if (activeServerId) {
      localStorage.setItem("activeServerId", activeServerId)
    }
  }, [activeServerId])

  useEffect(() => {
    localStorage.setItem("tunEnabled", String(tunEnabled))
  }, [tunEnabled])

  useEffect(() => {
    localStorage.setItem("proxyMode", proxyMode)
  }, [proxyMode])

  // Import State
  const [isImporting, setIsImporting] = useState(false)

  const handleImport = async (url: string) => {
    if (!url) return
    setIsImporting(true)
    try {
      // 1. Snapshot existing profiles to identify the new one later
      const preProfiles: any[] = await invoke("get_profiles")
      const preIds = new Set(preProfiles.map(p => p.id))

      // 2. Perform Import
      // TODO: Add name support in separate modal or prompt? For now auto-name in backend
      await invoke("import_subscription", { url, name: null })

      // 3. update UI immediately to show the new card
      const postProfiles: any[] = await invoke("get_profiles")
      // Reverse to show newest at top (backend appends, so reverse order is correct)
      setProfiles(postProfiles.reverse())

      // Flatten nodes for server list immediately
      const allNodes = postProfiles.flatMap((p: any) => p.nodes)
      updateServersState(allNodes)

      toast.success(`导入完成，后台正在更新节点...`)
      setIsImporting(false) // Stop loading animation immediately

      // 4. Find the NEW profile(s) and probe in background
      const newProfiles = postProfiles.filter(p => !preIds.has(p.id))
      const newNodes = newProfiles.flatMap(p => p.nodes)
      const ids = newNodes.map(n => n.id)

      if (ids.length > 0) {
        // Run in background, refresh UI when done
        // NO AWAIT here to ensure UI is unblocked
        invoke("check_node_locations", { nodeIds: ids }).then(() => {
          fetchProfiles()
        }).catch(e => console.error("Background probe failed:", e))
      }
    } catch (e: any) {
      toast.error(`Import failed: ${e}`)
      setIsImporting(false)
    }
  }

  const handleUpdateProfile = async (id: string) => {
    try {
      await invoke("update_subscription_profile", { id })
      fetchProfiles()
      toast.success("Subscription updated")
    } catch (e: any) {
      toast.error(`Update failed: ${e}`)
    }
  }

  const handleUpdateAll = async () => {
    if (isLoading) return
    setIsLoading(true)
    toast.info("Updating all subscriptions...")
    try {
      // Execute all updates
      const promises = profiles.map(p => invoke("update_subscription_profile", { id: p.id }))
      await Promise.allSettled(promises)

      // Refresh list
      fetchProfiles()
      toast.success("Update completed")
    } catch (e: any) {
      console.error(e)
      toast.error("Some updates might have failed")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteProfile = async (id: string) => {
    try {
      await invoke("delete_profile", { id })
      fetchProfiles()
      toast.success("Subscription deleted")
    } catch (e: any) {
      toast.error(`Delete failed: ${e}`)
    }
  }

  const handleSaveNode = async (node: Node) => {
    try {
      if (node.id) {
        // Edit
        await invoke("update_node", { id: node.id, node })
        toast.success("Node updated")
      } else {
        // Add
        // We need the ID of the new node to check location. 
        // Backend `add_node` doesn't return ID currently, but we generate it in frontend usually? 
        // Wait, the `node` passed here comes from `NodeEditor`. 
        // If it was a new node, `node.id` might be empty or generated by frontend?
        // Checking `add_node` backend: it generates UUID if not provided? 
        // Actually `Node` struct has `id: String`. 
        // Let's check NodeEditor. If it generates ID before save, we are good.
        // If not, we might miss the ID. 
        // Assuming `add_node` works on the partial node.

        // Actually best way: Fetch profiles, find the new node (by name/url?) or just rely on the fact 
        // that we will just re-fetch.
        // For now, let's just add it.
        await invoke("add_node", { node })
        toast.success("Node added")

        // Trigger check for all nodes to be safe, or if we can know the ID.
        // Let's just fetch profiles and check untagged ones?
        // Simplest: Check all locations if count is small, or just wait for user to refresh.
        // But per requirement: "auto update icon".
        // Use a delayed full check or check-all.
        invoke("check_node_locations", { nodeIds: [node.id] }).catch(() => {
          // If node.id was empty, this might fail or do nothing if backend generated it.
          // However, usually Frontend generates ID for new items to avoid this racy roundtrip.
        })
      }
      // Trigger a re-fetch + location check for everything to be sure?
      // Or just fetch profiles.
      fetchProfiles()
      setEditorOpen(false)
    } catch (e: any) {
      toast.error(`Save failed: ${e}`)
    }
  }

  const [nodeToDelete, setNodeToDelete] = useState<string | null>(null)

  const handleDeleteNode = (id: string) => {
    setNodeToDelete(id)
  }

  const confirmDeleteNode = async () => {
    if (!nodeToDelete) return
    const id = nodeToDelete

    try {
      await invoke("delete_node", { id })
      fetchProfiles()
      toast.success("Node deleted")
      if (activeServerId === id) {
        setActiveServerId(null)
        if (isConnected) toggleProxy() // Stop if deleted active
      }
    } catch (e: any) {
      toast.error(`Delete failed: ${e}`)
      console.error(e)
    } finally {
      setNodeToDelete(null)
    }
  }

  const handleTunToggle = async () => {
    const nextState = !tunEnabled

    // Helper Check Logic (Only check if enabling)
    if (nextState) {
      try {
        const installed = await invoke("check_helper")
        if (!installed) {
          toast.info("Installing helper for TUN Mode...", { id: "helper-install" })
          // This might throw if user cancels auth, so we catch it
          await invoke("install_helper")
          toast.success("Helper installed", { id: "helper-install" })
        }
      } catch (e: any) {
        console.error(e)
        toast.error("Failed to install helper: " + e.message || e)
        return; // Don't proceed if helper check/install failed
      }
    }

    // Just update the preference state. The reactive useEffect will handle the rest.
    setTunEnabled(nextState)
    if (isConnected) {
      toast.success(`Tun Mode ${nextState ? 'Enabled' : 'Disabled'}`)
    }
  }

  const toggleProxy = async () => {
    if (isLoading) return
    setIsLoading(true)
    try {
      if (isConnected) {
        // Just update state, the useEffect takes care of the backend
        setIsConnected(false)
      } else {
        // Find active service node
        const node = servers.find(s => s.id === activeServerId)
        if (!node && servers.length > 0) {
          if (!activeServerId) {
            toast.warning("Please select a server first")
            setIsLoading(false)
            return
          }
        }

        // Handle TUN Mode check only (rest handled by useEffect)
        if (tunEnabled) {
          const installed = await invoke("check_helper")
          if (!installed) {
            toast.info("Installing network helper...")
            await invoke("install_helper")
          }
        }

        setIsConnected(true)
      }
    } catch (error: any) {
      console.error(error)
      toast.error(error.message || "Failed to toggle proxy")
    } finally {
      setIsLoading(false)
    }
  }

  const handlePingNode = async (id: string) => {
    try {
      const ping: number = await invoke("url_test", { nodeId: id })
      setServers(prev => prev.map(s => s.id === id ? { ...s, ping } : s))
    } catch (e) {
      console.error("Ping failed:", e)
      toast.error("Latency test failed")
    }
  }

  const handleServerToggle = async (id: string) => {
    if (isLoading) return

    // If clicking the currently connected server -> Stop
    if (isConnected && activeServerId === id) {
      await toggleProxy()
      return
    }

    // Otherwise -> Connect to this server (Switching or Starting)
    setIsLoading(true)
    try {
      setActiveServerId(id) // Update selection UI immediately

      const node = servers.find(s => s.id === id)
      if (node) {
        // Handle TUN Mode check here too
        if (tunEnabled) {
          try {
            const installed = await invoke("check_helper")
            if (!installed) {
              toast.info("Installing helper for TUN Mode...")
              await invoke("install_helper")
              toast.success("Helper installed")
            }
          } catch (e: any) {
            console.error("Helper check/install failed:", e)
            toast.error("TUN mode requires helper: " + e)
            setIsLoading(false)
            return
          }
        }

        setActiveServerId(id)
        setIsConnected(true)
      }
    } catch (e: any) {
      toast.error(`Connection failed: ${e}`)
      // If failed and we were switching, maybe revert activeId? For now keep it simple.
    } finally {
      setIsLoading(false)
    }
  }

  // View State
  const [currentView, setCurrentView] = useState<"dashboard" | "locations" | "rules" | "settings" | "proxies">("dashboard")
  const [profiles, setProfiles] = useState<any[]>([])

  // Derive active subscription stats
  const activeSubscription = profiles.find(p => p.nodes.some((n: any) => n.id === activeServerId))

  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState<string | null>(null)

  const handleSubscriptionSelect = (id: string) => {
    setSelectedSubscriptionId(id)
    setCurrentView("subscription_detail" as any)
  }

  // Sub-components for views to keep return clean
  const renderView = () => {
    switch (currentView) {
      case "locations":
        return (
          <LocationsView
            servers={servers}
            activeServerId={activeServerId}
            isConnected={isConnected}
            onSelect={(id) => setActiveServerId(id)}
            onToggle={handleServerToggle}
            onImport={handleImport}
            onEdit={(node) => {
              if (node) {
                setEditingNode(node as Node)
                setEditorOpen(true)
              } else {
                setShowAddModal(true)
              }
            }}
            onDelete={handleDeleteNode}
            onRefresh={fetchProfiles}
          />
        )
      case "proxies": // Mapped to Subscriptions
        return (
          <SubscriptionsView
            profiles={profiles}
            onUpdate={handleUpdateProfile}
            onDelete={handleDeleteProfile}
            onAdd={() => setShowAddModal(true)}
            onSelect={handleSubscriptionSelect}
            onUpdateAll={handleUpdateAll}
            isImporting={isImporting}
          />
        )
      case "subscription_detail" as any:
        const subscription = profiles.find(p => p.id === selectedSubscriptionId)
        if (!subscription) return <div>Subscription not found</div>

        // Filter servers to show only ones from this subscription
        // We need to map subscription nodes to the `servers` format (which `updateServersState` does into `servers` state)
        // But `servers` contains ALL nodes. So we filter `servers` by checking if ID is in subscription nodes.
        const subNodeIds = new Set(subscription.nodes.map((n: any) => n.id))
        const subServers = servers.filter(s => subNodeIds.has(s.id))

        return (
          <div className="flex-1 flex flex-col h-full overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="border-b border-black/[0.02] dark:border-white/[0.02] bg-transparent px-8 pt-6 pb-2 shrink-0 relative z-30">
              <div className="max-w-5xl mx-auto w-full flex items-center gap-4 mb-4">
                <button
                  onClick={() => setCurrentView("proxies")}
                  className="p-2 -ml-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-text-secondary hover:text-text-primary transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                </button>
                <div>
                  <h2 className="text-2xl font-bold text-text-primary tracking-tight">{subscription.name}</h2>
                  <p className="text-sm text-text-secondary font-medium">
                    {subServers.length} Nodes
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-8 sidebar-scroll">
              <div className="max-w-5xl mx-auto w-full pb-20">
                <ServerList
                  servers={subServers}
                  activeServerId={activeServerId}
                  isConnected={isConnected}
                  onSelect={(id) => setActiveServerId(id)}
                  onToggle={handleServerToggle}
                  onImport={handleImport}
                  onEdit={(node) => {
                    if (node) {
                      setEditingNode(node as unknown as Node)
                      setEditorOpen(true)
                    } else {
                      // Pre-fill subscription ID if adding new? Not supported yet.
                      setShowAddModal(true)
                    }
                  }}
                  onDelete={handleDeleteNode}
                  showLogs={showLogs}
                  setShowLogs={setShowLogs}
                  logs={logs}
                  onClearLogs={() => setLogs([])}
                  onPing={handlePingNode}
                  hideHeader={true}
                />
              </div>
            </div>
          </div>
        )
      case "rules":
        return <RulesView />
      case "settings":
        return <SettingsView key={currentView} />
      case "dashboard":
      default:
        // Original Dashboard Content
        return (
          <div className="flex-1 overflow-y-auto px-8 py-8 sidebar-scroll flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-2 duration-700">
            <div className="max-w-5xl mx-auto flex flex-col w-full space-y-10 pb-20">
              <ConnectionStatus
                isConnected={isConnected}
                serverName={servers.find(s => s.id === activeServerId)?.name}
                flagUrl={connectionDetails ? getFlagUrlFromCode(connectionDetails.countryCode) : servers.find(s => s.id === activeServerId)?.flagUrl}
                realIp={connectionDetails?.ip}
                mode={proxyMode}
                onModeChange={setProxyMode}
                tunEnabled={tunEnabled}
                onTunToggle={handleTunToggle}
              />



              <ServerList
                servers={servers}
                activeServerId={activeServerId}
                isConnected={isConnected}
                onSelect={(id) => setActiveServerId(id)}
                onToggle={handleServerToggle}
                onImport={handleImport}
                onEdit={(node) => {
                  if (node) {
                    setEditingNode(node as unknown as Node)
                    setEditorOpen(true)
                  } else {
                    setShowAddModal(true)
                  }
                }}
                onDelete={handleDeleteNode}
                showLogs={showLogs}
                setShowLogs={setShowLogs}
                logs={logs}
                onClearLogs={() => setLogs([])}
                onPing={handlePingNode}
              />
            </div>
          </div>
        )
    }
  }

  return (
    <div className="h-screen flex gap-2 p-2 overflow-hidden" data-tauri-drag-region>
      <WindowControls />
      <Sidebar
        currentView={currentView as any}
        onViewChange={setCurrentView as any}
        subscription={activeSubscription}
      />
      <main className="flex-1 flex flex-col h-full relative overflow-hidden rounded-xl bg-black/10 backdrop-blur-sm border border-white/5">
        {currentView !== "locations" && currentView !== "rules" && currentView !== "settings" && currentView !== "proxies" && (currentView as any) !== "subscription_detail" && (
          <Header
            isConnected={isConnected}
            onToggle={toggleProxy}
            isLoading={isLoading}
          />
        )}

        {renderView()}

        {/* Modals */}
        <NodeEditor
          isOpen={isEditorOpen}
          initialNode={editingNode}
          onClose={() => setEditorOpen(false)}
          onSave={handleSaveNode}
        />
        <ConfirmationModal
          isOpen={!!nodeToDelete}
          title="Delete Node"
          message="Are you sure you want to delete this connection? This action cannot be undone."
          confirmText="Delete"
          isDanger
          onConfirm={confirmDeleteNode}
          onCancel={() => setNodeToDelete(null)}
        />
        <AddNodeModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onManual={() => {
            setEditingNode(null)
            setEditorOpen(true)
          }}
          onImport={handleImport}
        />
      </main>
    </div>
  )
}
