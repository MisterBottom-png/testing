package com.vitautas.drumkit

import java.io.ByteArrayOutputStream
import java.nio.file.Files
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class DiagnosticBundleSaverTest {
    @Test
    fun copiesBundleBytesToSelectedDestination() {
        val source = Files.createTempFile("drum-diagnostic", ".zip").toFile()
        val expected = ByteArray(32_769) { index -> (index % 251).toByte() }
        source.writeBytes(expected)
        val destination = ByteArrayOutputStream()

        val copiedBytes = DiagnosticBundleSaver.copyTo(source, destination)

        assertEquals(expected.size.toLong(), copiedBytes)
        assertArrayEquals(expected, destination.toByteArray())
    }

    @Test
    fun rejectsMissingBundleBeforeOpeningDestination() {
        val missing = Files.createTempDirectory("missing-diagnostic").resolve("missing.zip").toFile()

        val failure = assertThrows(IllegalArgumentException::class.java) {
            DiagnosticBundleSaver.copyTo(missing, ByteArrayOutputStream())
        }

        assertEquals("diagnostic bundle is unavailable", failure.message)
    }
}
