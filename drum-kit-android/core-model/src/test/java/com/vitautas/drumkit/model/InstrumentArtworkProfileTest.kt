package com.vitautas.drumkit.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class InstrumentArtworkProfileTest {
    @Test
    fun everyRendererHasOneNineLayerArtworkProfile() {
        assertEquals(InstrumentRendererKey.entries.size, StudioKitArtworkProfiles.profiles.size)
        for (rendererKey in InstrumentRendererKey.entries) {
            val profile = StudioKitArtworkProfiles.forRenderer(rendererKey)
            assertEquals(rendererKey, profile.rendererKey)
            assertEquals(9, profile.layerOrder.size)
            assertEquals(9, profile.layerOrder.toSet().size)
        }
    }

    @Test
    fun staticArtworkSitsBetweenSupportAndHitFeedback() {
        for (profile in StudioKitArtworkProfiles.profiles) {
            assertEquals(InstrumentArtworkLayerRole.CONTACT_SHADOW, profile.layerOrder.first())
            assertEquals(InstrumentArtworkLayerRole.SUPPORT, profile.layerOrder[1])
            assertTrue(
                profile.layerOrder.indexOf(InstrumentArtworkLayerRole.BODY) <
                    profile.layerOrder.indexOf(InstrumentArtworkLayerRole.PLAYABLE_SURFACE),
            )
            assertTrue(
                profile.layerOrder.indexOf(InstrumentArtworkLayerRole.PLAYABLE_SURFACE) <
                    profile.layerOrder.indexOf(InstrumentArtworkLayerRole.DETAIL),
            )
            assertEquals(InstrumentArtworkLayerRole.HIT_FEEDBACK, profile.layerOrder.last())
        }
    }

    @Test
    fun rendererMaterialsMatchTheStudioKit() {
        assertEquals(
            InstrumentArtworkMaterial.WINE_SHELL,
            StudioKitArtworkProfiles.forRenderer(InstrumentRendererKey.DRUM).material,
        )
        assertEquals(
            InstrumentArtworkMaterial.BRUSHED_STEEL,
            StudioKitArtworkProfiles.forRenderer(InstrumentRendererKey.SNARE).material,
        )
        assertEquals(
            InstrumentArtworkMaterial.DARK_KICK,
            StudioKitArtworkProfiles.forRenderer(InstrumentRendererKey.KICK).material,
        )
        assertEquals(
            InstrumentArtworkMaterial.BRONZE,
            StudioKitArtworkProfiles.forRenderer(InstrumentRendererKey.CYMBAL).material,
        )
        assertEquals(
            InstrumentArtworkMaterial.BRONZE_PAIR,
            StudioKitArtworkProfiles.forRenderer(InstrumentRendererKey.HI_HAT).material,
        )
    }
}
