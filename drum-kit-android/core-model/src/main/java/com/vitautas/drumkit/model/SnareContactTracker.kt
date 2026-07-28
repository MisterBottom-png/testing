package com.vitautas.drumkit.model

/** A held snare-rim contact used to make cross-stick an intentional two-contact gesture. */
data class SnareContact(
    val pointerId: Int,
    val normalizedX: Float,
    val normalizedY: Float,
    val startedAtNanos: Long,
)

/**
 * Keeps only currently-held snare contacts. The input layer owns its lifecycle and must call
 * [remove] for pointer-up and [clear] for cancellation, interruption, and audio-session loss.
 */
class SnareContactTracker {
    private val contacts = mutableMapOf<Int, SnareContact>()

    fun resolveAndRecord(
        pointerId: Int,
        normalizedX: Float,
        normalizedY: Float,
        velocity: Float,
        eventTimeNanos: Long,
    ): SnareArticulation {
        val articulation = SnareArticulationResolver.resolve(
            normalizedX = normalizedX,
            normalizedY = normalizedY,
            velocity = velocity,
            restingContacts = contacts.values.filter { contact ->
                eventTimeNanos - contact.startedAtNanos in 0L..CrossStickWindowNanos
            },
        )
        contacts[pointerId] = SnareContact(
            pointerId = pointerId,
            normalizedX = normalizedX,
            normalizedY = normalizedY,
            startedAtNanos = eventTimeNanos.coerceAtLeast(0L),
        )
        return articulation
    }

    fun remove(pointerId: Int) {
        contacts.remove(pointerId)
    }

    fun clear() {
        contacts.clear()
    }

    private companion object {
        const val CrossStickWindowNanos = 500_000_000L
    }
}
