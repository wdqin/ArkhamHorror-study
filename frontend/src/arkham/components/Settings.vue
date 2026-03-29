<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import { type Game } from '@/arkham/types/Game'
import { useDebug } from '@/arkham/debug'
import { useSettings } from '@/stores/settings'

const props = defineProps<{
  game: Game
  playerId: string
  closeSettings: () => void
}>()

const debug = useDebug()
const investigator = computed(() => {
  return Object.values(props.game.investigators).find(i => i.playerId === props.playerId)
})
const settingsStore = useSettings()

const skipTriggers = ref(investigator.value.settings.globalSettings.ignoreUnrelatedSkillTestTriggers)
const cardScale = computed({
  get: () => settingsStore.cardScale,
  set: (value: number | string) => settingsStore.setCardScale(Number(value))
})
const cardScalePercent = computed(() => `${Math.round(settingsStore.cardScale * 100)}%`)

watch(() => skipTriggers.value, (value) => {
  if (investigator.value) {
    debug.send(props.game.id,
      ({ tag: 'UpdateGlobalSetting'
       , contents: [investigator.value.id, {tag: "SetIgnoreUnrelatedSkillTestTriggers", contents: value}]
       }
      )
    )
  }
})

</script>
<template>
  <div class="settings">
    <div class="options box">
      <h2 class="title">{{$t('gameBar.viewSettingTitle', {investigator: investigator.name.title})}}</h2>
      <div class="option-row">
        <label>{{$t('gameBar.viewSettingSkipTriggers')}}</label>
        <input type="checkbox" v-model="skipTriggers" />
      </div>
      <div class="slider-group">
        <div class="slider-header">
          <label for="card-scale-slider">{{ $t('gameBar.viewSettingCardSize') }}</label>
          <span class="slider-value">{{ cardScalePercent }}</span>
        </div>
        <input
          id="card-scale-slider"
          v-model="cardScale"
          type="range"
          :min="settingsStore.minCardScale"
          :max="settingsStore.maxCardScale"
          step="0.05"
        />
        <p class="slider-help">{{ $t('gameBar.viewSettingCardSizeHelp') }}</p>
        <button class="reset-button" @click="settingsStore.resetCardScale()">{{ $t('gameBar.viewSettingCardSizeReset') }}</button>
      </div>
    </div>
    <div>
      <button @click="closeSettings">{{$t('close')}}</button>
    </div>
  </div>
</template>

<style scoped>
.box {
  margin: 10px;
}

.option-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.slider-group {
  margin-top: 16px;
}

.slider-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.slider-value {
  color: var(--title);
  font-weight: bold;
}

input[type="range"] {
  width: 100%;
}

.slider-help {
  margin-top: 8px;
  color: var(--title);
  font-size: 0.95em;
}

.reset-button {
  margin-top: 10px;
}

button {
  width: 100%;
}
</style>
