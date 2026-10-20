<template>
  <!-- Static low-amplitude displacement affects only the sampled backdrop.
       Keep SVG in the document: external SVG backdrop references are unreliable. -->
  <svg width="0" height="0" class="glass-material-defs" aria-hidden="true" focusable="false">
    <defs>
      <filter
        id="nav-glass-lens"
        x="-10%"
        y="-10%"
        width="120%"
        height="120%"
        color-interpolation-filters="sRGB"
      >
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.012 0.018"
          numOctaves="2"
          seed="7"
          result="noise"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="noise"
          scale="12"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </defs>
  </svg>
</template>
<style scoped>
.glass-material-defs {
  position: absolute;
  pointer-events: none;
}
</style>
