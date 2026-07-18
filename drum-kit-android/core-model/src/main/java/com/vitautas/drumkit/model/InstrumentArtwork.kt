package com.vitautas.drumkit.model

enum class InstrumentArtworkLayerRole {
    CONTACT_SHADOW,
    SUPPORT,
    BODY,
    LOWER_TRIM,
    HARDWARE,
    PLAYABLE_SURFACE,
    UPPER_TRIM,
    DETAIL,
    HIT_FEEDBACK,
}

enum class InstrumentArtworkMaterial {
    WINE_SHELL,
    BRUSHED_STEEL,
    DARK_KICK,
    BRONZE,
    BRONZE_PAIR,
}

data class InstrumentArtworkProfile(
    val rendererKey: InstrumentRendererKey,
    val material: InstrumentArtworkMaterial,
    val layerOrder: List<InstrumentArtworkLayerRole>,
)

object StudioKitArtworkProfiles {
    private val standardLayerOrder = listOf(
        InstrumentArtworkLayerRole.CONTACT_SHADOW,
        InstrumentArtworkLayerRole.SUPPORT,
        InstrumentArtworkLayerRole.BODY,
        InstrumentArtworkLayerRole.LOWER_TRIM,
        InstrumentArtworkLayerRole.HARDWARE,
        InstrumentArtworkLayerRole.PLAYABLE_SURFACE,
        InstrumentArtworkLayerRole.UPPER_TRIM,
        InstrumentArtworkLayerRole.DETAIL,
        InstrumentArtworkLayerRole.HIT_FEEDBACK,
    )

    val profiles: List<InstrumentArtworkProfile> = listOf(
        profile(InstrumentRendererKey.DRUM, InstrumentArtworkMaterial.WINE_SHELL),
        profile(InstrumentRendererKey.SNARE, InstrumentArtworkMaterial.BRUSHED_STEEL),
        profile(InstrumentRendererKey.KICK, InstrumentArtworkMaterial.DARK_KICK),
        profile(InstrumentRendererKey.CYMBAL, InstrumentArtworkMaterial.BRONZE),
        profile(InstrumentRendererKey.HI_HAT, InstrumentArtworkMaterial.BRONZE_PAIR),
    )

    private val profilesByRenderer = profiles.associateBy { it.rendererKey }

    fun forRenderer(rendererKey: InstrumentRendererKey): InstrumentArtworkProfile =
        requireNotNull(profilesByRenderer[rendererKey]) { "Missing artwork profile for $rendererKey" }

    private fun profile(
        rendererKey: InstrumentRendererKey,
        material: InstrumentArtworkMaterial,
    ): InstrumentArtworkProfile = InstrumentArtworkProfile(
        rendererKey = rendererKey,
        material = material,
        layerOrder = standardLayerOrder,
    )
}
