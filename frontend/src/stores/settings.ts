import { defineStore } from "pinia"
import { ref } from "vue"

const CARD_SCALE_KEY = "cardScale"
const DEFAULT_CARD_SCALE = 1
const MIN_CARD_SCALE = 0.75
const MAX_CARD_SCALE = 1.5

function clampCardScale(value: number) {
  return Math.min(MAX_CARD_SCALE, Math.max(MIN_CARD_SCALE, Number.isFinite(value) ? value : DEFAULT_CARD_SCALE))
}

function loadCardScale() {
  const stored = Number(localStorage.getItem(CARD_SCALE_KEY))
  return clampCardScale(stored)
}

export const useSettings = defineStore("settings", () => {
  const splitView = ref(false)
  const cardScale = ref(loadCardScale())

  function toggleSplitView() {
    splitView.value = !splitView.value
  }

  const showBonded = ref(false)

  function toggleShowBonded() {
    showBonded.value = !showBonded.value
  }

  function setCardScale(value: number) {
    const nextValue = clampCardScale(value)
    cardScale.value = nextValue
    localStorage.setItem(CARD_SCALE_KEY, String(nextValue))
  }

  function resetCardScale() {
    setCardScale(DEFAULT_CARD_SCALE)
  }

  return {
    splitView,
    toggleSplitView,
    showBonded,
    toggleShowBonded,
    cardScale,
    setCardScale,
    resetCardScale,
    defaultCardScale: DEFAULT_CARD_SCALE,
    minCardScale: MIN_CARD_SCALE,
    maxCardScale: MAX_CARD_SCALE,
  }
})
