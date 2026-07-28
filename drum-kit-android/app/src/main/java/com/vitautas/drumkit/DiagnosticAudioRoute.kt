package com.vitautas.drumkit

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import java.util.Locale

internal data class DiagnosticAudioRoute(
    val description: String,
    val category: String,
    val bluetoothLatencyExpected: Boolean,
)

internal data class DiagnosticAudioRouteDevice(
    val id: Int,
    val type: Int,
    val productName: String,
)

internal object DiagnosticAudioRouteResolver {
    fun resolve(context: Context): DiagnosticAudioRoute {
        val audioManager = context.getSystemService(AudioManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val attributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_GAME)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build()
            val selectedDevices = runCatching {
                audioManager.getAudioDevicesForAttributes(attributes)
            }.getOrDefault(emptyList())
            if (selectedDevices.isNotEmpty()) {
                return describeDevices(
                    devices = selectedDevices.map { device -> device.toDiagnosticDevice() },
                    selected = true,
                )
            }
        }

        val availableDevices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
            .map { device -> device.toDiagnosticDevice() }
        return describeDevices(devices = availableDevices, selected = false)
    }

    internal fun describeDevices(
        devices: List<DiagnosticAudioRouteDevice>,
        selected: Boolean,
    ): DiagnosticAudioRoute {
        if (devices.isEmpty()) {
            return DiagnosticAudioRoute(
                description = if (selected) "selected:unresolved" else "available_only:none",
                category = "unresolved",
                bluetoothLatencyExpected = false,
            )
        }

        val orderedDevices = devices
            .distinctBy { it.id to it.type }
            .sortedWith(compareBy<DiagnosticAudioRouteDevice> { it.type }.thenBy { it.id })
        val categories = orderedDevices.map { categoryForType(it.type) }.distinct()
        val category = categories.singleOrNull() ?: "multiple"
        val bluetoothSelected = selected && orderedDevices.any { isBluetoothType(it.type) }
        val prefix = if (selected) "selected" else "available_only"
        val description = buildString {
            append(prefix).append(':')
            orderedDevices.forEachIndexed { index, device ->
                if (index > 0) append('|')
                append(typeName(device.type)).append('#').append(device.id)
                val product = device.productName.cleanProductName()
                if (product.isNotEmpty()) append('(').append(product).append(')')
            }
        }
        return DiagnosticAudioRoute(
            description = description,
            category = category,
            bluetoothLatencyExpected = bluetoothSelected,
        )
    }

    private fun AudioDeviceInfo.toDiagnosticDevice(): DiagnosticAudioRouteDevice = DiagnosticAudioRouteDevice(
        id = id,
        type = type,
        productName = productName.toString(),
    )

    private fun String.cleanProductName(): String = trim()
        .replace('|', '/')
        .replace('(', '[')
        .replace(')', ']')
        .take(80)

    internal fun isBluetoothType(type: Int): Boolean = when (type) {
        AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
        AudioDeviceInfo.TYPE_BLE_HEADSET,
        AudioDeviceInfo.TYPE_BLE_SPEAKER,
        AudioDeviceInfo.TYPE_BLE_BROADCAST,
        -> true

        else -> false
    }

    internal fun categoryForType(type: Int): String = when (type) {
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER,
        AudioDeviceInfo.TYPE_BUILTIN_EARPIECE,
        -> "device_speaker"

        AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
        AudioDeviceInfo.TYPE_WIRED_HEADSET,
        AudioDeviceInfo.TYPE_USB_DEVICE,
        AudioDeviceInfo.TYPE_USB_ACCESSORY,
        AudioDeviceInfo.TYPE_USB_HEADSET,
        -> "wired_or_usb"

        AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
        AudioDeviceInfo.TYPE_BLE_HEADSET,
        AudioDeviceInfo.TYPE_BLE_SPEAKER,
        AudioDeviceInfo.TYPE_BLE_BROADCAST,
        -> "bluetooth"

        AudioDeviceInfo.TYPE_HDMI,
        AudioDeviceInfo.TYPE_HDMI_ARC,
        AudioDeviceInfo.TYPE_HDMI_EARC,
        AudioDeviceInfo.TYPE_LINE_ANALOG,
        AudioDeviceInfo.TYPE_LINE_DIGITAL,
        AudioDeviceInfo.TYPE_AUX_LINE,
        AudioDeviceInfo.TYPE_DOCK,
        -> "external_output"

        AudioDeviceInfo.TYPE_HEARING_AID -> "hearing_aid"
        else -> "other"
    }

    internal fun typeName(type: Int): String = when (type) {
        AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "built_in_earpiece"
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "built_in_speaker"
        AudioDeviceInfo.TYPE_WIRED_HEADSET -> "wired_headset"
        AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "wired_headphones"
        AudioDeviceInfo.TYPE_LINE_ANALOG -> "line_analog"
        AudioDeviceInfo.TYPE_LINE_DIGITAL -> "line_digital"
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "bluetooth_sco"
        AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "bluetooth_a2dp"
        AudioDeviceInfo.TYPE_HDMI -> "hdmi"
        AudioDeviceInfo.TYPE_HDMI_ARC -> "hdmi_arc"
        AudioDeviceInfo.TYPE_HDMI_EARC -> "hdmi_earc"
        AudioDeviceInfo.TYPE_USB_DEVICE -> "usb_device"
        AudioDeviceInfo.TYPE_USB_ACCESSORY -> "usb_accessory"
        AudioDeviceInfo.TYPE_DOCK -> "dock"
        AudioDeviceInfo.TYPE_FM -> "fm"
        AudioDeviceInfo.TYPE_BUILTIN_MIC -> "built_in_mic"
        AudioDeviceInfo.TYPE_FM_TUNER -> "fm_tuner"
        AudioDeviceInfo.TYPE_TV_TUNER -> "tv_tuner"
        AudioDeviceInfo.TYPE_TELEPHONY -> "telephony"
        AudioDeviceInfo.TYPE_AUX_LINE -> "aux_line"
        AudioDeviceInfo.TYPE_IP -> "ip"
        AudioDeviceInfo.TYPE_BUS -> "bus"
        AudioDeviceInfo.TYPE_USB_HEADSET -> "usb_headset"
        AudioDeviceInfo.TYPE_HEARING_AID -> "hearing_aid"
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER_SAFE -> "built_in_speaker_safe"
        AudioDeviceInfo.TYPE_REMOTE_SUBMIX -> "remote_submix"
        AudioDeviceInfo.TYPE_BLE_HEADSET -> "ble_headset"
        AudioDeviceInfo.TYPE_BLE_SPEAKER -> "ble_speaker"
        AudioDeviceInfo.TYPE_BLE_BROADCAST -> "ble_broadcast"
        else -> "type_${type.toString().lowercase(Locale.ROOT)}"
    }
}

internal object DiagnosticAudioLatencyAssessment {
    const val LargeBurstDurationMillis = 10f

    fun burstDurationMillis(sampleRate: Int, framesPerBurst: Int): Float =
        if (sampleRate > 0 && framesPerBurst > 0) {
            framesPerBurst.toFloat() * 1_000f / sampleRate.toFloat()
        } else {
            0f
        }

    fun isUnusuallyLarge(sampleRate: Int, framesPerBurst: Int): Boolean =
        burstDurationMillis(sampleRate, framesPerBurst) >= LargeBurstDurationMillis

    fun metadataDescription(
        route: DiagnosticAudioRoute,
        sampleRate: Int,
        framesPerBurst: Int,
    ): String {
        val burstDuration = burstDurationMillis(sampleRate, framesPerBurst)
        return buildString {
            append(route.description)
            append(";category=").append(route.category)
            append(";bluetoothLatencyExpected=").append(route.bluetoothLatencyExpected)
            append(";burstDurationMs=").append(String.format(Locale.ROOT, "%.3f", burstDuration))
            append(";largeBurst=").append(burstDuration >= LargeBurstDurationMillis)
        }
    }

    fun warningText(
        route: DiagnosticAudioRoute,
        sampleRate: Int,
        framesPerBurst: Int,
    ): String? = when {
        route.bluetoothLatencyExpected -> "Bluetooth audio · noticeable playing latency expected"
        isUnusuallyLarge(sampleRate, framesPerBurst) -> "Large audio buffer · playing latency may be noticeable"
        else -> null
    }
}
