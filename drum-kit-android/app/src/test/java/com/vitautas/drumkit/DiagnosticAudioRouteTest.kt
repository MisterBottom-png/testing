package com.vitautas.drumkit

import android.media.AudioDeviceInfo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DiagnosticAudioRouteTest {
    @Test
    fun selectedBluetoothRouteWarnsAndNamesProduct() {
        val route = DiagnosticAudioRouteResolver.describeDevices(
            devices = listOf(
                DiagnosticAudioRouteDevice(
                    id = 23,
                    type = AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
                    productName = "Galaxy Buds3 Pro",
                ),
            ),
            selected = true,
        )

        assertEquals("bluetooth", route.category)
        assertTrue(route.bluetoothLatencyExpected)
        assertTrue(route.description.contains("selected:bluetooth_a2dp#23"))
        assertTrue(route.description.contains("Galaxy Buds3 Pro"))
    }

    @Test
    fun selectedPhoneSpeakerDoesNotWarn() {
        val route = DiagnosticAudioRouteResolver.describeDevices(
            devices = listOf(
                DiagnosticAudioRouteDevice(
                    id = 4,
                    type = AudioDeviceInfo.TYPE_BUILTIN_SPEAKER,
                    productName = "Speaker",
                ),
            ),
            selected = true,
        )

        assertEquals("device_speaker", route.category)
        assertFalse(route.bluetoothLatencyExpected)
        assertEquals(
            null,
            DiagnosticAudioLatencyAssessment.warningText(
                route = route,
                sampleRate = 48_000,
                framesPerBurst = 96,
            ),
        )
    }

    @Test
    fun availableBluetoothDeviceIsNotClaimedAsSelected() {
        val route = DiagnosticAudioRouteResolver.describeDevices(
            devices = listOf(
                DiagnosticAudioRouteDevice(
                    id = 23,
                    type = AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
                    productName = "Connected Buds",
                ),
            ),
            selected = false,
        )

        assertTrue(route.description.startsWith("available_only:"))
        assertFalse(route.bluetoothLatencyExpected)
    }

    @Test
    fun burstDurationSeparatesSpeakerAndBluetoothExamples() {
        assertEquals(
            2f,
            DiagnosticAudioLatencyAssessment.burstDurationMillis(48_000, 96),
            0.0001f,
        )
        assertFalse(DiagnosticAudioLatencyAssessment.isUnusuallyLarge(48_000, 96))

        assertEquals(
            20f,
            DiagnosticAudioLatencyAssessment.burstDurationMillis(96_000, 1_920),
            0.0001f,
        )
        assertTrue(DiagnosticAudioLatencyAssessment.isUnusuallyLarge(96_000, 1_920))
    }

    @Test
    fun metadataDescriptionIncludesRouteAndLatencyAssessment() {
        val route = DiagnosticAudioRoute(
            description = "selected:built_in_speaker#4(Speaker)",
            category = "device_speaker",
            bluetoothLatencyExpected = false,
        )

        val description = DiagnosticAudioLatencyAssessment.metadataDescription(
            route = route,
            sampleRate = 48_000,
            framesPerBurst = 96,
        )

        assertTrue(description.contains("category=device_speaker"))
        assertTrue(description.contains("bluetoothLatencyExpected=false"))
        assertTrue(description.contains("burstDurationMs=2.000"))
        assertTrue(description.contains("largeBurst=false"))
    }
}
