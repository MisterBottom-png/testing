package com.vitautas.drumkit

import java.io.File
import java.io.OutputStream

internal object DiagnosticBundleSaver {
    fun copyTo(
        source: File,
        destination: OutputStream,
    ): Long {
        require(source.isFile) { "diagnostic bundle is unavailable" }
        return source.inputStream().buffered().use { input ->
            destination.buffered().use { output ->
                input.copyTo(output).also { output.flush() }
            }
        }
    }
}
