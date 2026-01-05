package com.shafreeck.tunnet

import android.content.Intent
import android.net.VpnService
import android.os.ParcelFileDescriptor
import android.util.Log
import java.io.IOException

class TunnetVpnService : VpnService() {
    private var vpnInterface: ParcelFileDescriptor? = null
    private var config: String? = null

    companion object {
        private const val TAG = "TunnetVpnService"
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) return START_NOT_STICKY

        val action = intent.action
        if (action == "STOP") {
            stopVpn()
            return START_NOT_STICKY
        }

        config = intent.getStringExtra("config")
        if (config == null) {
            Log.e(TAG, "No config provided")
            return START_NOT_STICKY
        }

        startVpn()
        return START_STICKY
    }

    private fun startVpn() {
        try {
            val builder = Builder()
                .setSession("Tunnet")
                .addAddress("172.19.0.1", 30) // Default TUN address
                .addDnsServer("1.1.1.1")
                .addRoute("0.0.0.0", 0)
                .setMtu(1500)
                .setBlocking(false)

            vpnInterface = builder.establish()
            
            if (vpnInterface != null) {
                val fd = vpnInterface!!.fd
                Log.i(TAG, "VPN Interface established with FD: $fd")
                
                // Call Libbox via JNI (Assuming Libbox is generated via gomobile)
                // Libbox.startMobile(fd, config)
                // Note: Actual JNI call will depend on gomobile generated package name
            } else {
                Log.e(TAG, "Failed to establish VPN interface")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error starting VPN", e)
        }
    }

    private fun stopVpn() {
        try {
            // Libbox.stop()
            vpnInterface?.close()
            vpnInterface = null
            stopSelf()
        } catch (e: IOException) {
            Log.e(TAG, "Error stopping VPN", e)
        }
    }

    override fun onDestroy() {
        stopVpn()
        super.onDestroy()
    }

    override fun onRevoke() {
        stopVpn()
        super.onRevoke()
    }
}
