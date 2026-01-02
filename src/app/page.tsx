"use client" // Ensure this is client component for hooks

import { useState, useEffect, useRef } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen, emit } from "@tauri-apps/api/event"
import { useTranslation } from "react-i18next"
import { AppSettings, defaultSettings, getAppSettings, saveAppSettings } from "@/lib/settings"
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
  const { t } = useTranslation()
  // Hydration fix
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const isLoadingRef = useRef(false)
  useEffect(() => { isLoadingRef.current = isLoading }, [isLoading])

  /* Removed early return to fix hook order */
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

  const [proxyMode, setProxyMode] = useState<'global' | 'rule' | 'direct'>('rule')
  const [tunEnabled, setTunEnabled] = useState(false)
  const [ipRefreshKey, setIpRefreshKey] = useState(0)

  // Settings State
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [systemProxyEnabled, setSystemProxyEnabled] = useState(false)

  // Sync derived state
  useEffect(() => {
    setSystemProxyEnabled(settings.system_proxy)
  }, [settings.system_proxy])


  const toggleSystemProxy = async () => {
    const newSettings = { ...settings, system_proxy: !settings.system_proxy }
    // Optimistic update
    setSettings(newSettings)
    try {
      await saveAppSettings(newSettings)
      // Visual feedback via toast? Maybe not needed for simple toggle, consistent with Tray which has no toast for this.
      // Dashboard usually has toasts for actions.
      // toast.success(newSettings.system_proxy ? t('status.system_proxy_on') : t('status.system_proxy_off'))
      // Let's use the translation text for toast if we want it.
      // But text keys are "System On" / "System Off".
      // Let's just rely on the switch UI for feedback.
    } catch (e: any) {
      console.error(e)
      toast.error(t('toast.save_failed', { error: e }))
      // Revert
      setSettings(settings)
    }
  }

  useEffect(() => {
    let timer: NodeJS.Timeout
    if (isConnected) {
      // Fetch Real IP using backend proxy client with a delay to ensure core is ready
      // Fetch Real IP using backend proxy client with a retry mechanism
      // Clear current details and sync to other windows when starting a fresh check
      setConnectionDetails(null)
      emit("connection-details-update", null)

      const checkIpWithRetry = async (retries = 3) => {
        try {
          const data: any = await invoke("check_ip")
          if (data.status === "success") {
            const details = {
              ip: data.query,
              country: data.country,
              countryCode: data.countryCode.toLowerCase(),
              isp: data.isp
            };
            setConnectionDetails(details)
            // Sync to other windows (e.g. tray)
            emit("connection-details-update", details)
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
  }, [isConnected, activeServerId, ipRefreshKey])

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

  const lastPulseIdRef = useRef(0)

  // Reactive Proxy Controller (The single source of truth for execution)
  useEffect(() => {
    const pulseId = ++lastPulseIdRef.current
    const syncProxy = async () => {
      // 1. If we are disconnected, ensure no proxy is running (if it was)
      if (!isConnected) {
        if (lastAppliedConfigRef.current) {
          console.log("Disconnecting proxy...")
          setIsLoading(true)
          try {
            const result: any = await invoke("stop_proxy")
            if (pulseId !== lastPulseIdRef.current) return
            setIsConnected(result.is_running)
            lastAppliedConfigRef.current = null
          } catch (e) {
            console.error("Failed to stop proxy", e)
          } finally {
            setIsLoading(false)
          }
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
        loading: lastAppliedConfigRef.current ? t('toast.updating_to', { mode: proxyMode }) : t('toast.connecting_to', { server: node.name }),
        success: lastAppliedConfigRef.current ? t('toast.updated_to', { mode: proxyMode }) : t('toast.connected_to', { server: node.name }),
        error: (err: any) => t('toast.action_failed', { error: err })
      })

      try {
        const result: any = await promise
        if (pulseId !== lastPulseIdRef.current) return

        lastAppliedConfigRef.current = currentConfigKey
        // Sync state from return value to be sure
        setIsConnected(result.is_running)
        setTunEnabled(result.tun_mode)
        setProxyMode(result.routing_mode as any)

        // Trigger IP refresh after successful sync
        setIpRefreshKey(prev => prev + 1)
      } catch (e) {
        console.error("Failed to sync proxy", e)
        if (pulseId !== lastPulseIdRef.current) return
        if (!lastAppliedConfigRef.current) setIsConnected(false)
      } finally {
        setIsLoading(false)
      }
    }

    syncProxy()
  }, [isConnected, proxyMode, tunEnabled])

  // Watch and persist active node ID
  useEffect(() => {
    if (activeServerId) {
      invoke("get_app_settings").then((settings: any) => {
        if (settings.active_node_id !== activeServerId) {
          invoke("save_app_settings", {
            settings: { ...settings, active_node_id: activeServerId }
          }).catch(console.error)
        }
      }).catch(console.error)
    }
  }, [activeServerId])

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

    // Init: Load App Settings (including System Proxy)
    getAppSettings().then(setSettings)

    // Listen for settings update from other windows (e.g. Tray)
    const unlistenSettings = listen<AppSettings>("settings-update", (event) => {
      setSettings(event.payload)
    })

    // Init: Load stored profiles and nodes
    fetchProfiles(true)

    // Init: Load current proxy status from backend
    invoke("get_proxy_status").then((status: any) => {
      if (status.is_running) {
        setIsConnected(true)
        if (status.node) {
          setActiveServerId(status.node.id)
        }
        if (status.routing_mode) {
          setProxyMode(status.routing_mode)
        }
        setTunEnabled(status.tun_mode)

        // Prevent immediate reload by setting lastAppliedConfigRef
        const nodeId = status.node?.id
        if (nodeId) {
          lastAppliedConfigRef.current = `${nodeId}:${status.routing_mode}:${status.tun_mode}`
        }
      } else {
        // If not running, load the persisted active node ID from settings
        invoke("get_app_settings").then((settings: any) => {
          if (settings.active_node_id) {
            setActiveServerId(settings.active_node_id)
          }
        }).catch(console.error)
      }
    }).catch(console.error)

    // Listen for proxy status change from other windows (e.g. tray)
    const unlistenStatus = listen<any>("proxy-status-change", (event) => {
      // If we are currently loading a local change, ignore background events
      // to avoid race conditions with intermediate status changes (e.g. during restart)
      if (isLoadingRef.current) return;

      const status = event.payload
      setIsConnected(status.is_running)
      if (status.node) {
        setActiveServerId(status.node.id)
      }
      if (status.routing_mode) {
        setProxyMode(status.routing_mode)
      }
      setTunEnabled(status.tun_mode)
      // Sync ref to avoid restart loop
      if (status.node) {
        lastAppliedConfigRef.current = `${status.node.id}:${status.routing_mode}:${status.tun_mode}`
      }

      // Trigger IP refresh on status change if running
      if (status.is_running) {
        setIpRefreshKey(prev => prev + 1)
      }
    })

    // Listen for IP updates from other windows
    const unlistenIp = listen<any>("connection-details-update", (event) => {
      setConnectionDetails(event.payload)
    })

    // Listen for requests from other windows (e.g. Tray) to share current IP info
    const unlistenIpRequest = listen("request-connection-details", () => {
      if (connectionDetailsRef.current) {
        emit("connection-details-update", connectionDetailsRef.current)
      }
    })

    return () => {
      unlisten.then(f => f())
      unlistenStatus.then(f => f())
      unlistenIp.then(f => f())
      unlistenIpRequest.then(f => f())
      unlistenSettings.then(f => f())
    }
  }, [])

  // Listen for TUN mode sync from Tray (when proxy is stopped)
  useEffect(() => {
    const unlistenTunPromise = listen<boolean>("tun-mode-updated", (event) => {
      // Only update if not running (if running, proxy-status-change handles it)
      if (!isConnected) {
        setTunEnabled(event.payload)
      }
    })
    return () => {
      unlistenTunPromise.then(f => f())
    }
  }, [isConnected])

  // Keep ref updated for listener access
  const connectionDetailsRef = useRef(connectionDetails)
  useEffect(() => { connectionDetailsRef.current = connectionDetails }, [connectionDetails])

  const fetchProfiles = (checkPing = false) => {
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

      if (checkPing && allNodes.length > 0) {
        checkLatency(allNodes)
      }
    }).catch(console.error)
  }

  const checkLatency = async (nodes: any[]) => {
    const ids = nodes.map((n: any) => n.id)
    try {
      await invoke("check_node_pings", { nodeIds: ids })
      // Reload to reflect pings
      fetchProfiles(false)
    } catch (e) {
      console.error(e)
    }
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
      ping: node.ping ?? node.location?.latency ?? 0
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
      // 1. Snapshot existing profiles to identify the new one later (Wait, we get ID now!)
      // No need for snapshotting anymore.

      // 2. Perform Import
      // Backend now returns the new Profile ID string
      const newProfileId: string = await invoke("import_subscription", { url, name: null })

      // 3. update UI immediately to show the new card
      const postProfiles: any[] = await invoke("get_profiles")
      // Reverse to show newest at top (backend appends, so reverse order is correct)
      setProfiles(postProfiles.reverse())

      // Flatten nodes for server list immediately
      const allNodes = postProfiles.flatMap((p: any) => p.nodes)
      updateServersState(allNodes)

      toast.success(t('toast.import_success'))
      setIsImporting(false) // Stop loading animation immediately

      // 4. Find the NEW profile and probe its nodes
      const targetProfile = postProfiles.find(p => p.id === newProfileId)
      if (targetProfile && targetProfile.nodes) {
        const ids = targetProfile.nodes.map((n: any) => n.id)
        if (ids.length > 0) {
          // Run in background, refresh UI when done
          // NO AWAIT here to ensure UI is unblocked
          invoke("check_node_locations", { nodeIds: ids }).then(() => {
            // Re-fetch profiles to get the updated location data
            fetchProfiles()
          }).catch(e => console.error("Background probe failed:", e))
        }
      }
    } catch (e: any) {
      toast.error(t('toast.action_failed', { error: e }))
      setIsImporting(false)
    }
  }

  const handleUpdateProfile = async (id: string) => {
    const promise = async () => {
      await invoke("update_subscription_profile", { id })
      fetchProfiles()
    }

    toast.promise(promise(), {
      loading: t('toast.updating_sub'),
      success: t('toast.sub_updated'),
      error: (e) => t('toast.action_failed', { error: e })
    })
  }

  const handleUpdateAll = async () => {
    if (isLoading) return
    setIsLoading(true)
    toast.info(t('toast.updating_all'))
    try {
      // Execute all updates
      const promises = profiles.map(p => invoke("update_subscription_profile", { id: p.id }))
      await Promise.allSettled(promises)

      // Refresh list
      fetchProfiles()
      toast.success(t('toast.update_completed'))
    } catch (e: any) {
      console.error(e)
      toast.error(t('toast.update_failed'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteProfile = async (id: string) => {
    try {
      await invoke("delete_profile", { id })
      fetchProfiles()
      toast.success(t('toast.sub_deleted'))
    } catch (e: any) {
      toast.error(t('toast.delete_failed', { error: e }))
    }
  }

  const handleSaveNode = async (node: Node) => {
    try {
      if (node.id) {
        // Edit
        await invoke("update_node", { id: node.id, node })
        toast.success(t('toast.node_updated'))
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
        toast.success(t('toast.node_added'))

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
      toast.error(t('toast.save_failed', { error: e }))
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
      toast.success(t('toast.node_deleted'))
      if (activeServerId === id) {
        setActiveServerId(null)
        if (isConnected) toggleProxy() // Stop if deleted active
      }
    } catch (e: any) {
      toast.error(t('toast.delete_failed', { error: e }))
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
          toast.info(t('toast.helper_installing'), { id: "helper-install" })
          // This might throw if user cancels auth, so we catch it
          await invoke("install_helper")
          toast.success(t('toast.helper_installed'), { id: "helper-install" })
        }
      } catch (e: any) {
        console.error(e)
        toast.error(t('toast.helper_failed', { error: e.message || e }))
        return; // Don't proceed if helper check/install failed
      }
    }

    // Just update the preference state. The reactive useEffect will handle the rest.
    setTunEnabled(nextState)
    // Emit sync event for Tray (when stopped)
    emit("tun-mode-updated", nextState)

    if (isConnected) {
      toast.success(t(nextState ? 'toast.tun_mode_enabled' : 'toast.tun_mode_disabled'))
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
            toast.warning(t('toast.select_server'))
            setIsLoading(false)
            return
          }
        }

        // Handle TUN Mode check only (rest handled by useEffect)
        if (tunEnabled) {
          const installed = await invoke("check_helper")
          if (!installed) {
            toast.info(t('toast.helper_installing'))
            await invoke("install_helper")
          }
        }

        setIsConnected(true)
      }
    } catch (error: any) {
      console.error(error)
      toast.error(t('toast.action_failed', { error: error.message || "Failed to toggle proxy" }))
    } finally {
      setIsLoading(false)
    }
  }

  const handlePingNode = async (id: string) => {
    if (id === "ALL") {
      await checkLatency(servers)
      return
    }
    try {
      const ping: number = await invoke("url_test", { nodeId: id })
      setServers(prev => prev.map(s => s.id === id ? { ...s, ping } : s))
    } catch (e) {
      console.error("Ping failed:", e)
      toast.error(t('toast.action_failed', { error: "Latency test failed" }))
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
              toast.info(t('toast.helper_installing'))
              await invoke("install_helper")
              toast.success(t('toast.helper_installed'))
            }
          } catch (e: any) {
            console.error("Helper check/install failed:", e)
            toast.error(t('toast.helper_failed', { error: e }))
            setIsLoading(false)
            return
          }
        }

        setActiveServerId(id)
        setIsConnected(true)
      }
    } catch (e: any) {
      toast.error(t('toast.connection_failed', { error: e }))
      // If failed and we were switching, maybe revert activeId? For now keep it simple.
    } finally {
      setIsLoading(false)
    }
  }

  // View State
  const [currentView, setCurrentView] = useState<"dashboard" | "locations" | "rules" | "settings" | "proxies">("dashboard")
  const [profiles, setProfiles] = useState<any[]>([])

  // Derive active subscription stats
  const activeSubscription = profiles.find(p => p.nodes.some((n: any) => String(n.id) === String(activeServerId))) || profiles[0]

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
            onRefresh={() => fetchProfiles(true)}
            onPing={handlePingNode}
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
              <div className="absolute inset-0 z-0" data-tauri-drag-region />
              <div className="max-w-5xl mx-auto w-full flex items-center gap-4 mb-4 relative z-10 pointer-events-none">
                <button
                  onClick={() => setCurrentView("proxies")}
                  className="p-2 -ml-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-text-secondary hover:text-text-primary transition-colors pointer-events-auto"
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
        const activeServer = servers.find(s => s.id === activeServerId)

        return (
          <div className="flex-1 overflow-y-auto px-8 py-8 sidebar-scroll flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-2 duration-700">
            <div className="max-w-5xl mx-auto flex flex-col w-full space-y-10 pb-20">
              <ConnectionStatus
                isConnected={isConnected}
                serverName={activeServer?.name}
                flagUrl={activeServer?.flagUrl}
                latency={activeServer?.ping}
                connectionDetails={connectionDetails ? {
                  ip: connectionDetails.ip,
                  country: connectionDetails.country,
                  isp: connectionDetails.isp
                } : undefined}
                onLatencyClick={() => activeServerId && handlePingNode(activeServerId)}
                onMainToggle={toggleProxy}
                mode={proxyMode}
                onModeChange={(m) => {
                  setProxyMode(m)
                  // If connected, syncProxy effect will handle the rest
                }}
                tunEnabled={tunEnabled}
                onTunToggle={handleTunToggle}
                systemProxyEnabled={systemProxyEnabled}
                onSystemProxyToggle={toggleSystemProxy}
                isLoading={isLoading}
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

  if (!mounted) return null

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
