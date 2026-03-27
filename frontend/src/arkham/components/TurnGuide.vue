<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Game } from '@/arkham/types/Game'
import { fullName } from '@/arkham/types/Name'
import { imgsrc } from '@/arkham/helpers'
import type { Source } from '@/arkham/types/Source'
import type { Token } from '@/arkham/types/Token'
import type { TurnGuideModel } from '@/arkham/turnGuide'
import {
  initialInlinePromptSelections,
  inlinePromptHasUnmetRequirements,
} from '@/arkham/questionPrompt'

const props = defineProps<{
  model: TurnGuideModel
  game: Game | null
  disabled?: boolean
  canAct?: boolean
  variant?: 'default' | 'sidebar'
}>()

const emit = defineEmits<{
  (e: 'choose', value: number): void
  (e: 'chooseAmounts', value: Record<string, number>): void
  (e: 'choosePaymentAmounts', value: Record<string, number>): void
  (e: 'exchangeTokens', value: { source: Source, fromInvestigator: string, toInvestigator: string, token: Token, amount: number }): void
}>()

const { t } = useI18n()
const promptSelections = ref<Record<string, number>>({})
const failedActionImages = ref<Record<string, true>>({})
const failedCategoryImages = ref<Record<string, true>>({})
const activeCategoryKey = ref('')

watch(
  () => props.model.signature,
  () => {
    syncActiveCategory()
    failedActionImages.value = {}
    failedCategoryImages.value = {}
  },
  { immediate: true }
)

const promptDisabled = computed(() => props.disabled || props.canAct === false)
const activeCategory = computed(() => {
  return props.model.categories.find((category) => category.key === activeCategoryKey.value) ?? props.model.categories[0] ?? null
})
const currentPrompt = computed(() => activeCategory.value?.inlinePrompt ?? null)
const unmetPromptRequirements = computed(() => inlinePromptHasUnmetRequirements(currentPrompt.value, promptSelections.value))

watch(
  currentPrompt,
  (prompt) => {
    promptSelections.value = initialInlinePromptSelections(prompt)
  },
  { immediate: true }
)

function investigatorName(investigatorId: string) {
  if (!props.game) {
    return investigatorId
  }

  const investigator = props.game.investigators[investigatorId] ?? props.game.otherInvestigators[investigatorId]
  return investigator ? fullName(investigator.name) : investigatorId
}

function syncActiveCategory() {
  const categories = props.model.categories
  if (categories.length === 0) {
    activeCategoryKey.value = ''
    return
  }

  if (categories.some((category) => category.key === activeCategoryKey.value)) {
    return
  }

  activeCategoryKey.value = categories[0].key
}

function actionImageSrc(action: TurnGuideModel['categories'][number]['actions'][number]) {
  return action.imagePath ? imgsrc(action.imagePath) : ''
}

function actionIconSrc(action: TurnGuideModel['categories'][number]['actions'][number]) {
  return action.iconPath ? imgsrc(action.iconPath) : ''
}

function categoryImageSrc(category: TurnGuideModel['categories'][number]) {
  return category.imagePath ? imgsrc(category.imagePath) : ''
}

function onActionImageError(actionKey: string) {
  failedActionImages.value = {
    ...failedActionImages.value,
    [actionKey]: true,
  }
}

function onCategoryImageError(categoryKey: string) {
  failedCategoryImages.value = {
    ...failedCategoryImages.value,
    [categoryKey]: true,
  }
}

function choose(choiceIndex: number | null) {
  if (choiceIndex === null || promptDisabled.value) {
    return
  }

  emit('choose', choiceIndex)
}

function updateField(key: string, nextValue: number, min: number, max: number) {
  const clamped = Math.min(max, Math.max(min, Number.isFinite(nextValue) ? nextValue : 0))
  promptSelections.value = {
    ...promptSelections.value,
    [key]: clamped,
  }
}

function submitInlinePrompt() {
  if (!currentPrompt.value || promptDisabled.value || unmetPromptRequirements.value) {
    return
  }

  switch (currentPrompt.value.kind) {
    case 'amounts':
      emit('chooseAmounts', { ...promptSelections.value })
      return
    case 'payment-amounts':
      emit('choosePaymentAmounts', { ...promptSelections.value })
      return
    case 'exchange-amounts':
      emit('exchangeTokens', {
        source: currentPrompt.value.source,
        fromInvestigator: currentPrompt.value.investigator1Id,
        toInvestigator: currentPrompt.value.investigator2Id,
        token: currentPrompt.value.token,
        amount: promptSelections.value.amount ?? 0,
      })
      return
    default:
      return
  }
}
</script>

<template>
  <section
    v-if="model.visible"
    class="turn-guide"
    :class="[`turn-guide--${model.state}`, `turn-guide--${props.variant ?? 'default'}`]"
    role="status"
    aria-live="polite"
  >
    <div class="turn-guide-copy">
      <p class="turn-guide-headline">{{ model.headline }}</p>
      <p v-if="model.instruction" class="turn-guide-instruction">{{ model.instruction }}</p>
    </div>

    <div v-if="model.categories.length > 0" class="turn-guide-category-tabs">
      <button
        v-for="category in model.categories"
        :key="category.key"
        class="turn-guide-category-tab"
        :class="{ active: activeCategory?.key === category.key }"
        type="button"
        @click="activeCategoryKey = category.key"
      >
        <img
          v-if="category.imagePath && !failedCategoryImages[category.key]"
          class="turn-guide-category-tab-image"
          :class="[`turn-guide-category-tab-image--${category.imageKind ?? 'icon'}`]"
          :src="categoryImageSrc(category)"
          :alt="category.imageAlt ?? category.title"
          @error="onCategoryImageError(category.key)"
        />
        <span class="turn-guide-category-tab-label">{{ category.title }}</span>
      </button>
    </div>

    <section v-if="activeCategory" class="turn-guide-category-panel">
      <div v-if="activeCategory.actions.length > 0" class="turn-guide-actions">
        <button
          v-for="action in activeCategory.actions"
          :key="action.key"
          class="turn-guide-action"
          :class="[`turn-guide-action--${action.tone}`]"
          :disabled="promptDisabled || action.disabled"
          @click="choose(action.choiceIndex)"
        >
          <img
            v-if="action.imagePath && !failedActionImages[action.key]"
            class="turn-guide-action-image"
            :class="[`turn-guide-action-image--${action.imageKind ?? 'card'}`]"
            :src="actionImageSrc(action)"
            :alt="action.imageAlt ?? action.contextTitle ?? action.label"
            @error="onActionImageError(action.key)"
          />
          <span class="turn-guide-action-copy">
            <span class="turn-guide-action-heading">
              <span class="turn-guide-action-label">{{ action.label }}</span>
              <span
                v-if="action.iconGlyph"
                class="turn-guide-action-glyph"
                :class="[`turn-guide-action-glyph--${action.iconGlyphKind ?? 'choice'}`]"
                aria-hidden="true"
              >{{ action.iconGlyph }}</span>
              <img
                v-else-if="action.iconPath"
                class="turn-guide-action-icon"
                :src="actionIconSrc(action)"
                :alt="action.iconAlt ?? action.label"
              />
            </span>
            <span v-if="action.contextTitle" class="turn-guide-action-context">{{ action.contextTitle }}</span>
            <span v-if="action.detail || action.contextSubtitle" class="turn-guide-action-meta">
              <span v-if="action.detail">{{ action.detail }}</span>
              <span v-if="action.detail && action.contextSubtitle" class="turn-guide-action-separator">·</span>
              <span v-if="action.contextSubtitle">{{ action.contextSubtitle }}</span>
            </span>
          </span>
        </button>
      </div>

      <section v-if="activeCategory.inlinePrompt" class="turn-guide-prompt">
        <header class="turn-guide-prompt-header">
          <p class="turn-guide-prompt-title">{{ activeCategory.inlinePrompt.label }}</p>
        </header>

        <div v-if="activeCategory.inlinePrompt.kind === 'dropdown'" class="turn-guide-actions">
          <button
            v-for="option in activeCategory.inlinePrompt.options"
            :key="option.key"
            class="turn-guide-action turn-guide-action--primary"
            :disabled="promptDisabled"
            @click="choose(option.choiceIndex)"
          >
            <span class="turn-guide-action-copy">
              <span class="turn-guide-action-heading">
                <span class="turn-guide-action-label">{{ option.label }}</span>
              </span>
            </span>
          </button>
        </div>

        <form
          v-else-if="activeCategory.inlinePrompt.kind === 'amounts' || activeCategory.inlinePrompt.kind === 'payment-amounts'"
          class="turn-guide-form"
          @submit.prevent="submitInlinePrompt"
        >
          <label v-for="field in activeCategory.inlinePrompt.fields" :key="field.key" class="turn-guide-field">
            <span class="turn-guide-field-label">{{ field.label }}</span>
            <input
              type="number"
              :min="field.min"
              :max="field.max"
              :value="promptSelections[field.key] ?? 0"
              :disabled="promptDisabled"
              @input="updateField(field.key, Number(($event.target as HTMLInputElement).value), field.min, field.max)"
            />
          </label>
          <button class="turn-guide-submit" type="submit" :disabled="promptDisabled || unmetPromptRequirements">
            {{ activeCategory.inlinePrompt.submitLabel }}
          </button>
        </form>

        <form
          v-else-if="activeCategory.inlinePrompt.kind === 'exchange-amounts'"
          class="turn-guide-form"
          @submit.prevent="submitInlinePrompt"
        >
          <div class="turn-guide-exchange">
            <div class="turn-guide-exchange-side">
              <span class="turn-guide-field-label">{{ investigatorName(activeCategory.inlinePrompt.investigator1Id) }}</span>
              <span class="turn-guide-exchange-amount">
                {{ activeCategory.inlinePrompt.investigator1Amount - (promptSelections.amount ?? 0) }}
              </span>
            </div>
            <div class="turn-guide-exchange-token">{{ activeCategory.inlinePrompt.token }}</div>
            <div class="turn-guide-exchange-side">
              <span class="turn-guide-field-label">{{ investigatorName(activeCategory.inlinePrompt.investigator2Id) }}</span>
              <span class="turn-guide-exchange-amount">
                {{ activeCategory.inlinePrompt.investigator2Amount + (promptSelections.amount ?? 0) }}
              </span>
            </div>
          </div>
          <label class="turn-guide-field">
            <span class="turn-guide-field-label">{{ t('turnGuide.exchangeAmount') }}</span>
            <input
              type="number"
              :min="-activeCategory.inlinePrompt.investigator2Amount"
              :max="activeCategory.inlinePrompt.investigator1Amount"
              :value="promptSelections.amount ?? 0"
              :disabled="promptDisabled"
              @input="updateField('amount', Number(($event.target as HTMLInputElement).value), -activeCategory.inlinePrompt.investigator2Amount, activeCategory.inlinePrompt.investigator1Amount)"
            />
          </label>
          <button class="turn-guide-submit" type="submit" :disabled="promptDisabled || unmetPromptRequirements">
            {{ activeCategory.inlinePrompt.submitLabel }}
          </button>
        </form>
      </section>
    </section>
  </section>
</template>

<style scoped>
.turn-guide {
  border: 1px solid rgba(184, 199, 120, 0.24);
  border-radius: 14px;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.28);
  display: grid;
  gap: 0.9rem;
  margin: 0 10px 10px;
  max-height: calc(100vh - 180px);
  overflow: auto;
  padding: 0.95rem 1rem;
}

.turn-guide--sidebar {
  flex: 1;
  box-shadow: none;
  margin: 10px;
  max-height: none;
}

.turn-guide--your-turn {
  background:
    linear-gradient(135deg, rgba(32, 47, 24, 0.94), rgba(17, 28, 20, 0.98)),
    radial-gradient(circle at top left, rgba(180, 202, 120, 0.12), transparent 50%);
  border-color: rgba(180, 202, 120, 0.3);
}

.turn-guide--response-window {
  background:
    linear-gradient(135deg, rgba(57, 34, 14, 0.94), rgba(26, 19, 15, 0.98)),
    radial-gradient(circle at top left, rgba(232, 176, 89, 0.12), transparent 50%);
  border-color: rgba(232, 176, 89, 0.28);
}

.turn-guide-copy,
.turn-guide-prompt,
.turn-guide-category-panel,
.turn-guide-form {
  display: grid;
  gap: 0.55rem;
}

.turn-guide-headline,
.turn-guide-prompt-title {
  color: #f1f2db;
  font-family: "Teutonic", serif;
  letter-spacing: 0.05em;
  margin: 0;
  text-transform: uppercase;
}

.turn-guide-headline {
  font-size: 1.05rem;
}

.turn-guide-instruction,
.turn-guide-action-meta,
.turn-guide-field-label,
.turn-guide-exchange-amount,
.turn-guide-exchange-token {
  color: rgba(239, 239, 227, 0.9);
  margin: 0;
}

.turn-guide-category-tabs,
.turn-guide-actions,
.turn-guide-form,
.turn-guide-prompt {
  display: grid;
  gap: 0.7rem;
}

.turn-guide-category-tabs {
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
}

.turn-guide-category-tab {
  align-items: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  color: #f4f5ec;
  cursor: pointer;
  display: flex;
  font-size: 0.9rem;
  font-weight: 700;
  gap: 0.55rem;
  justify-content: flex-start;
  min-width: 0;
  padding: 0.65rem 0.75rem;
  text-align: left;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.turn-guide-category-tab.active {
  background: rgba(147, 100, 187, 0.3);
  border-color: rgba(209, 186, 240, 0.32);
}

.turn-guide-category-tab-image {
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  flex: 0 0 auto;
  object-fit: cover;
}

.turn-guide-category-tab-image--icon {
  height: 28px;
  width: 28px;
}

.turn-guide-category-tab-image--portrait {
  height: 36px;
  width: 24px;
}

.turn-guide-category-tab-label {
  min-width: 0;
  overflow-wrap: anywhere;
}

.turn-guide-actions {
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.turn-guide-action,
.turn-guide-submit {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  color: #f4f5ec;
  cursor: pointer;
  display: grid;
  gap: 0.2rem;
  height: 100%;
  min-width: 0;
  padding: 0.75rem 0.8rem;
  text-align: left;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.turn-guide-action {
  align-items: start;
  grid-template-columns: auto minmax(0, 1fr);
}

.turn-guide-action--primary,
.turn-guide-submit {
  background: rgba(147, 100, 187, 0.3);
}

.turn-guide-action--secondary {
  background: rgba(255, 255, 255, 0.06);
}

.turn-guide-action:hover:not(:disabled),
.turn-guide-submit:hover:not(:disabled) {
  border-color: rgba(255, 255, 255, 0.2);
}

.turn-guide-action:disabled,
.turn-guide-submit:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.turn-guide-action-image {
  align-self: start;
  background: rgba(10, 10, 10, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.28);
  height: 76px;
  object-fit: cover;
  object-position: center;
  width: 54px;
}

.turn-guide-action-image--tarot {
  height: 92px;
  width: 54px;
}

.turn-guide-action-image--portrait {
  height: 88px;
  object-fit: cover;
  width: 60px;
}

.turn-guide-action-image--landscape-card {
  height: 76px;
  object-fit: contain;
  width: 120px;
}

.turn-guide-action-copy {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
}

.turn-guide-action-label {
  font-size: 0.96rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.turn-guide-action-heading {
  align-items: center;
  display: flex;
  gap: 0.45rem;
  justify-content: space-between;
  min-width: 0;
}

.turn-guide-action-glyph {
  align-items: center;
  border-radius: 999px;
  display: inline-flex;
  flex: 0 0 auto;
  font-family: "arkham";
  font-size: 1.1rem;
  height: 1.7rem;
  justify-content: center;
  line-height: 1;
  width: 1.7rem;
}

.turn-guide-action-glyph--reaction {
  background: #a02ecb;
  font-family: "arkham";
  color: #fff;
}

.turn-guide-action-glyph--choice {
  background: rgba(255, 255, 255, 0.12);
  font-family: "ArkhamIcons";
  color: #fff;
}

.turn-guide-action-context {
  color: #f7f4df;
  font-size: 0.92rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.turn-guide-action-icon {
  flex: 0 0 auto;
  height: 1.15rem;
  object-fit: contain;
  width: 1.15rem;
}

.turn-guide-action-meta {
  font-size: 0.84rem;
  overflow-wrap: anywhere;
}

.turn-guide-action-separator {
  margin: 0 0.2rem;
}

.turn-guide-field {
  display: grid;
  gap: 0.35rem;
}

.turn-guide-field input {
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: #f4f5ec;
  padding: 0.65rem 0.75rem;
}

.turn-guide-submit {
  font-weight: 700;
}

.turn-guide-exchange {
  align-items: center;
  display: grid;
  gap: 0.8rem;
  grid-template-columns: 1fr auto 1fr;
}

.turn-guide-exchange-side {
  display: grid;
  gap: 0.35rem;
}

@media (max-width: 800px) and (orientation: portrait) {
  .turn-guide {
    margin: 0 6px 8px;
    max-height: none;
    padding: 0.85rem 0.9rem;
  }

  .turn-guide-exchange {
    grid-template-columns: 1fr;
  }
}
</style>
