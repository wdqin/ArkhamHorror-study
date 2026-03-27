import * as ArkhamGame from '@/arkham/types/Game'
import type { Game } from '@/arkham/types/Game'
import { cardImage, toCardContents } from '@/arkham/types/Card'
import type {
  AbilityLabel,
  AuxiliaryComponentLabel,
  CardLabel,
  CardPile,
  ChaosTokenLabel,
  Component,
  ComponentLabel,
  EngageLabel,
  EvadeLabel,
  FightLabel,
  FightLabelWithSkill,
  Message,
  PortraitLabel,
  ScenarioLabel,
  TarotLabel,
  TargetLabel,
} from '@/arkham/types/Message'
import { MessageType } from '@/arkham/types/Message'
import type { Question } from '@/arkham/types/Question'
import type { SkillType } from '@/arkham/types/SkillType'
import type { Action } from '@/arkham/types/Action'
import type { Source } from '@/arkham/types/Source'
import type { Target } from '@/arkham/types/Target'
import type { Difficulty } from '@/arkham/types/Difficulty'
import { fullName } from '@/arkham/types/Name'
import { tarotCardImage, type TarotCardArcana } from '@/arkham/types/TarotCard'
import { useDbCardStore } from '@/stores/dbCards'
import {
  inlinePromptForQuestion,
  normalizePromptText,
  questionInstructionText,
  type InlinePrompt,
} from '@/arkham/questionPrompt'

type Translate = (key: string, params?: Record<string, unknown>) => string

export interface TurnGuideAction {
  key: string
  label: string
  detail: string | null
  contextTitle: string | null
  contextSubtitle: string | null
  imagePath?: string
  imageAlt?: string
  imageKind?: 'card' | 'tarot' | 'landscape-card' | 'portrait'
  iconPath?: string
  iconAlt?: string
  iconGlyph?: string
  iconGlyphKind?: 'reaction' | 'choice'
  choiceIndex: number | null
  disabled: boolean
  tone: 'primary' | 'secondary'
}

export type TurnGuideCategoryKey =
  | 'general'
  | 'investigator'
  | 'hand'
  | 'play-area'
  | 'enemy'
  | 'location'
  | 'scenario'
  | 'chaos-special'

export interface TurnGuideCategory {
  key: TurnGuideCategoryKey
  title: string
  imagePath?: string
  imageAlt?: string
  imageKind?: 'icon' | 'portrait'
  actions: TurnGuideAction[]
  inlinePrompt: InlinePrompt | null
}

export interface TurnGuideModel {
  visible: boolean
  state: 'your-turn' | 'response-window'
  headline: string
  instruction: string
  categories: TurnGuideCategory[]
  signature: string
}

interface GroupSeed {
  key: string
  title: string
  subtitle: string | null
  imagePath?: string
  imageAlt?: string
  imageKind?: 'card' | 'tarot' | 'landscape-card' | 'portrait'
}

interface ActionSeed {
  categoryKey: TurnGuideCategoryKey
  action: TurnGuideAction
}

const CATEGORY_ORDER: TurnGuideCategoryKey[] = [
  'general',
  'investigator',
  'hand',
  'play-area',
  'enemy',
  'location',
  'scenario',
  'chaos-special',
]

const HIGHLIGHTED_TAGS = new Set<string>([
  MessageType.TARGET_LABEL,
  MessageType.CARD_LABEL,
  MessageType.COMPONENT_LABEL,
  MessageType.AUXILIARY_COMPONENT_LABEL,
  MessageType.GRID_LABEL,
  MessageType.KEY_LABEL,
  MessageType.PORTRAIT_LABEL,
  MessageType.SCENARIO_LABEL,
  MessageType.TAROT_LABEL,
  MessageType.CHAOS_TOKEN_LABEL,
  MessageType.CARD_PILE,
])

export function buildTurnGuideModel(game: Game, playerId: string, t: Translate): TurnGuideModel {
  const choices = ArkhamGame.choices(game, playerId)
  const question = game.question[playerId]
  const highlightedCount = choices.filter((choice) => HIGHLIGHTED_TAGS.has(choice.tag)).length
  const inlinePrompt = inlinePromptForQuestion(question, t)
  const categories = buildCategories(game, playerId, choices, inlinePrompt, t)
  const instruction = questionInstructionText(question, highlightedCount, t)
  const visible = categories.length > 0 || instruction.length > 0
  const state = game.activePlayerId === playerId ? 'your-turn' : 'response-window'

  return {
    visible,
    state,
    headline: t(state === 'your-turn' ? 'turnGuide.yourTurn' : 'turnGuide.responseWindow'),
    instruction,
    categories,
    signature: JSON.stringify({
      state,
      question: signatureForQuestion(question),
      categories: categories.map((category) => ({
        key: category.key,
        actions: category.actions.map((action) => `${action.key}:${action.choiceIndex ?? 'x'}`),
        prompt: signatureForPrompt(category.inlinePrompt),
      })),
    }),
  }
}

function buildCategories(
  game: Game,
  playerId: string,
  choices: Message[],
  inlinePrompt: InlinePrompt | null,
  t: Translate
): TurnGuideCategory[] {
  const categories = new Map<TurnGuideCategoryKey, TurnGuideCategory>(
    CATEGORY_ORDER.map((key) => [
      key,
        {
        key,
        title: categoryTitle(key, t),
        ...categoryImage(game, playerId, key, t),
        actions: [],
        inlinePrompt: null,
      },
    ])
  )

  choices.forEach((choice, index) => {
    const seed = actionSeedForChoice(game, choice, index, t)
    if (!seed || seed.action.label.trim().length === 0) {
      return
    }

    const category = categories.get(seed.categoryKey)
    if (category) {
      category.actions.push(seed.action)
    }
  })

  if (inlinePrompt) {
    const promptCategory = categories.get(categoryForPrompt(inlinePrompt))
    if (promptCategory) {
      promptCategory.inlinePrompt = inlinePrompt
    }
  }

  return CATEGORY_ORDER
    .map((key) => categories.get(key)!)
    .filter((category) => category.actions.length > 0 || category.inlinePrompt !== null)
}

function actionSeedForChoice(game: Game, choice: Message, index: number, t: Translate): ActionSeed | null {
  switch (choice.tag) {
    case MessageType.END_TURN_BUTTON:
      return generalSeed(
        index,
        {
          label: t('turnGuide.endTurn'),
          imagePath: investigatorPortraitImage(game, choice.investigatorId, true),
          imageAlt: investigatorName(game, choice.investigatorId),
          imageKind: 'portrait',
        },
        investigatorName(game, choice.investigatorId),
        'secondary'
      )
    case MessageType.SKIP_TRIGGERS_BUTTON:
      return generalSeed(
        index,
        {
          label: t('turnGuide.skipTriggers'),
          iconGlyph: '\u0059',
          iconGlyphKind: 'reaction',
          imagePath: investigatorPortraitImage(game, choice.investigatorId),
          imageAlt: investigatorName(game, choice.investigatorId),
          imageKind: 'portrait',
        },
        null,
        'secondary'
      )
    case MessageType.DONE:
      return generalSeed(index, normalizePromptText(choice.label, t), null, 'primary')
    case MessageType.LABEL:
      return generalSeed(index, normalizePromptText(choice.label, t), null, 'primary')
    case MessageType.TOOLTIP_LABEL:
      return generalSeed(index, normalizePromptText(choice.label, t), normalizePromptText(choice.tooltip, t), 'primary')
    case MessageType.SKILL_LABEL:
      return generalSeed(index, t('turnGuide.useSkill', { skill: skillName(choice.skillType, t) }), null, 'primary')
    case MessageType.SKILL_LABEL_WITH_LABEL:
      return generalSeed(index, normalizePromptText(choice.label, t), t('turnGuide.useSkill', { skill: skillName(choice.skillType, t) }), 'primary')
    case MessageType.START_SKILL_TEST_BUTTON:
      return generalSeed(index, t('turnGuide.startSkillTest'), null, 'primary')
    case MessageType.SKILL_TEST_APPLY_RESULTS_BUTTON:
      return generalSeed(
        index,
        {
          label: t('turnGuide.applyResults'),
          iconGlyph: '\uE91A',
          iconGlyphKind: 'choice',
        },
        null,
        'primary'
      )
    case MessageType.TOKEN_GROUP_CHOICE:
      return seedForResolvedGroup('chaos-special', resolveChaosBagGroup(t), index, t('turnGuide.chooseChaosToken'), null, 'primary')
    case MessageType.EFFECT_ACTION_BUTTON:
      return generalSeed(index, normalizePromptText(choice.tooltip, t), null, 'primary')
    case MessageType.FIGHT_LABEL:
      return seedForResolvedGroup('enemy', resolveEnemyGroup(game, choice.enemyId, t), index, t('turnGuide.fight'), null, 'primary')
    case MessageType.FIGHT_LABEL_WITH_SKILL:
      return seedForResolvedGroup('enemy', resolveEnemyGroup(game, choice.enemyId, t), index, t('turnGuide.fightWithSkill'), null, 'primary')
    case MessageType.EVADE_LABEL:
      return seedForResolvedGroup('enemy', resolveEnemyGroup(game, choice.enemyId, t), index, t('turnGuide.evade'), null, 'primary')
    case MessageType.ENGAGE_LABEL:
      return seedForResolvedGroup('enemy', resolveEnemyGroup(game, choice.enemyId, t), index, t('turnGuide.engage'), null, 'primary')
    case MessageType.ABILITY_LABEL:
      return abilitySeed(game, choice, index, t)
    case MessageType.PORTRAIT_LABEL:
      return seedForResolvedGroup('investigator', resolvePortraitGroup(game, choice, t), index, t('turnGuide.selectInvestigator'), null, 'secondary')
    case MessageType.CARD_LABEL:
      return seedForResolvedGroup('hand', resolveCardGroup(game, choice, t), index, t('turnGuide.selectCard'), null, 'secondary')
    case MessageType.TARGET_LABEL:
      return targetSeed(game, choice, index, t)
    case MessageType.COMPONENT_LABEL:
      return componentSeed(game, choice.component, index, t)
    case MessageType.AUXILIARY_COMPONENT_LABEL:
      return componentSeed(game, choice.component, index, t)
    case MessageType.SCENARIO_LABEL:
      return seedForResolvedGroup('scenario', resolveScenarioGroup(game, choice, t), index, t('turnGuide.selectScenario'), null, 'secondary')
    case MessageType.CHAOS_TOKEN_LABEL:
      return seedForResolvedGroup('chaos-special', resolveChaosTokenGroup(choice, t), index, t('turnGuide.selectChaosToken'), null, 'secondary')
    case MessageType.TAROT_LABEL:
      return seedForResolvedGroup('chaos-special', resolveTarotGroup(choice, t), index, t('turnGuide.selectTarot'), null, 'secondary')
    case MessageType.CARD_PILE:
      return seedForResolvedGroup('scenario', resolveCardPileGroup(game, choice, t), index, t('turnGuide.selectPile'), null, 'secondary')
    case MessageType.KEY_LABEL:
      return seedForResolvedGroup(
        'scenario',
        {
          key: 'scenario:key',
          title: t('turnGuide.selectKey'),
          subtitle: t('turnGuide.groupTypes.target'),
        },
        index,
        t('turnGuide.selectKey'),
        null,
        'secondary'
      )
    case MessageType.GRID_LABEL:
      return seedForResolvedGroup(
        'scenario',
        {
          key: `grid:${choice.gridLabel}`,
          title: choice.gridLabel,
          subtitle: t('turnGuide.groupTypes.target'),
        },
        index,
        t('turnGuide.selectTarget'),
        null,
        'secondary'
      )
    case MessageType.INVALID_LABEL:
    case MessageType.INFO:
      return null
    default:
      return null
  }
}

function generalSeed(
  index: number,
  label: string | {
    label: string
    iconPath?: string
    iconAlt?: string
    iconGlyph?: string
    iconGlyphKind?: 'reaction' | 'choice'
    imagePath?: string
    imageAlt?: string
    imageKind?: 'card' | 'tarot' | 'landscape-card' | 'portrait'
  },
  detail: string | null,
  tone: 'primary' | 'secondary'
): ActionSeed {
  const actionLabel = typeof label === 'string' ? { label } : label
  return {
    categoryKey: 'general',
    action: {
      key: `general-${index}-${actionLabel.label}`,
      label: actionLabel.label,
      detail,
      contextTitle: null,
      contextSubtitle: null,
      imagePath: actionLabel.imagePath,
      imageAlt: actionLabel.imageAlt,
      imageKind: actionLabel.imageKind,
      iconPath: actionLabel.iconPath,
      iconAlt: actionLabel.iconAlt,
      iconGlyph: actionLabel.iconGlyph,
      iconGlyphKind: actionLabel.iconGlyphKind,
      choiceIndex: index,
      disabled: false,
      tone,
    },
  }
}

function seedForResolvedGroup(
  categoryKey: TurnGuideCategoryKey,
  group: GroupSeed,
  index: number,
  label: string | { label: string, iconPath?: string, iconAlt?: string },
  detail: string | null,
  tone: 'primary' | 'secondary'
): ActionSeed {
  const actionLabel = typeof label === 'string' ? { label } : label
  return {
    categoryKey,
    action: {
      key: `${group.key}-${index}-${actionLabel.label}`,
      label: actionLabel.label,
      detail,
      contextTitle: group.title,
      contextSubtitle: group.subtitle,
      imagePath: group.imagePath,
      imageAlt: group.imageAlt,
      imageKind: group.imageKind,
      iconPath: actionLabel.iconPath,
      iconAlt: actionLabel.iconAlt,
      choiceIndex: index,
      disabled: false,
      tone,
    },
  }
}

function categoryTitle(categoryKey: TurnGuideCategoryKey, t: Translate) {
  switch (categoryKey) {
    case 'general':
      return t('turnGuide.categories.general')
    case 'investigator':
      return t('turnGuide.categories.investigator')
    case 'hand':
      return t('turnGuide.categories.hand')
    case 'play-area':
      return t('turnGuide.categories.playArea')
    case 'enemy':
      return t('turnGuide.categories.enemy')
    case 'location':
      return t('turnGuide.categories.location')
    case 'scenario':
      return t('turnGuide.categories.scenario')
    case 'chaos-special':
      return t('turnGuide.categories.chaosSpecial')
  }
}

function categoryImage(game: Game, playerId: string, categoryKey: TurnGuideCategoryKey, t: Translate) {
  switch (categoryKey) {
    case 'general':
      return {
        imagePath: 'lead-investigator.png',
        imageAlt: categoryTitle(categoryKey, t),
        imageKind: 'icon' as const,
      }
    case 'investigator':
      return investigatorCategoryImage(game, playerId, t)
    case 'hand':
      return {
        imagePath: 'player_card.png',
        imageAlt: categoryTitle(categoryKey, t),
        imageKind: 'icon' as const,
      }
    case 'play-area':
      return {
        imagePath: 'slots/ally.png',
        imageAlt: categoryTitle(categoryKey, t),
        imageKind: 'icon' as const,
      }
    case 'enemy':
      return {
        imagePath: 'encounter_back.jpg',
        imageAlt: categoryTitle(categoryKey, t),
        imageKind: 'icon' as const,
      }
    case 'location':
      return {
        imagePath: 'clue.png',
        imageAlt: categoryTitle(categoryKey, t),
        imageKind: 'icon' as const,
      }
    case 'scenario':
      return {
        imagePath: 'doom.png',
        imageAlt: categoryTitle(categoryKey, t),
        imageKind: 'icon' as const,
      }
    case 'chaos-special':
      return {
        imagePath: 'ct_eldersign.png',
        imageAlt: categoryTitle(categoryKey, t),
        imageKind: 'icon' as const,
      }
  }
}

function categoryForPrompt(prompt: InlinePrompt): TurnGuideCategoryKey {
  switch (prompt.kind) {
    case 'exchange-amounts':
      return 'investigator'
    default:
      return 'general'
  }
}

function abilitySeed(game: Game, choice: AbilityLabel, index: number, t: Translate): ActionSeed {
  const group = resolveAbilityGroup(game, choice, t)
  const categoryKey = categoryForAbility(game, choice, group)
  return seedForResolvedGroup(
    categoryKey,
    group,
    index,
    displayAbilityLabel(choice, t),
    categoryKey === 'investigator' ? investigatorName(game, choice.investigatorId) : null,
    'primary'
  )
}

function componentSeed(game: Game, component: Component, index: number, t: Translate): ActionSeed {
  return seedForResolvedGroup(
    categoryForComponent(component),
    resolveComponentGroup(game, component, t),
    index,
    componentAction(component, t),
    null,
    'secondary'
  )
}

function targetSeed(game: Game, choice: TargetLabel, index: number, t: Translate): ActionSeed {
  const group = resolveTargetGroup(game, choice, t)
  return seedForResolvedGroup(
    categoryForTarget(choice.target, group),
    group,
    index,
    targetActionLabel(choice.target, t),
    null,
    'secondary'
  )
}

function categoryForAbility(game: Game, choice: AbilityLabel, group: GroupSeed): TurnGuideCategoryKey {
  switch (choice.ability.source.tag) {
    case 'ActSource':
    case 'AgendaSource':
    case 'ScenarioSource':
    case 'CampaignSource':
      return 'scenario'
    case 'InvestigatorSource':
      return 'investigator'
    case 'AssetSource':
    case 'EventSource':
    case 'TreacherySource':
      return 'play-area'
    case 'EnemySource':
      return 'enemy'
    case 'LocationSource':
      return 'location'
    case 'TarotSource':
      return 'chaos-special'
    case 'AbilitySource':
    case 'ProxySource':
      return categoryForGroupSeed(group)
    default:
      return 'investigator'
  }
}

function categoryForComponent(component: Component): TurnGuideCategoryKey {
  switch (component.tag) {
    case 'InvestigatorComponent':
    case 'InvestigatorDeckComponent':
      return 'investigator'
    case 'AssetComponent':
      return 'play-area'
  }
}

function categoryForTarget(target: Target, group: GroupSeed): TurnGuideCategoryKey {
  switch (target.tag) {
    case 'InvestigatorTarget':
      return 'investigator'
    case 'EnemyTarget':
      return 'enemy'
    case 'LocationTarget':
      return 'location'
    case 'AssetTarget':
    case 'EventTarget':
    case 'TreacheryTarget':
      return 'play-area'
    case 'CardIdTarget':
      return 'hand'
    case 'ScenarioDeckTarget':
    case 'EncounterDeckTarget':
      return 'scenario'
    case 'ChaosTokenTarget':
    case 'ChaosTokenFaceTarget':
      return 'chaos-special'
    default:
      return categoryForGroupSeed(group)
  }
}

function categoryForGroupSeed(group: GroupSeed): TurnGuideCategoryKey {
  if (group.key.startsWith('investigator:')) return 'investigator'
  if (group.key.startsWith('asset:') || group.key.startsWith('event:') || group.key.startsWith('treachery:')) return 'play-area'
  if (group.key.startsWith('enemy:')) return 'enemy'
  if (group.key.startsWith('location:')) return 'location'
  if (group.key.startsWith('card:') || group.key.startsWith('card-id:')) return 'hand'
  if (
    group.key.startsWith('act:') ||
    group.key.startsWith('agenda:') ||
    group.key.startsWith('scenario:') ||
    group.key === 'scenario-deck' ||
    group.key === 'encounter-deck' ||
    group.key.startsWith('pile:')
  ) return 'scenario'
  if (group.key.startsWith('chaos') || group.key.startsWith('tarot:')) return 'chaos-special'
  return 'general'
}

function resolvePortraitGroup(game: Game, choice: PortraitLabel, t: Translate): GroupSeed {
  return investigatorGroup(game, choice.investigatorId, t)
}

function resolveCardGroup(_game: Game, choice: CardLabel, t: Translate): GroupSeed {
  const title = cardName(choice.cardCode, t)
  return {
    key: `card:${choice.cardCode}`,
    title,
    subtitle: t('turnGuide.groupTypes.card'),
    imagePath: cardCodeImage(choice.cardCode),
    imageAlt: title,
    imageKind: 'card',
  }
}

function resolveEnemyGroup(game: Game, enemyId: string, t: Translate): GroupSeed {
  const enemy = game.enemies[enemyId]
  const title = enemyName(game, enemyId, t)
  return {
    key: `enemy:${enemyId}`,
    title,
    subtitle: t('turnGuide.groupTypes.enemy'),
    imagePath: enemy ? enemyImage(enemy.cardCode, enemy.flipped) : undefined,
    imageAlt: title,
    imageKind: enemy ? 'card' : undefined,
  }
}

function resolveScenarioGroup(game: Game, choice: ScenarioLabel, t: Translate): GroupSeed {
  const title = normalizePromptText(choice.label, t) || game.scenario?.name.title || t('turnGuide.groupTypes.scenario')
  return {
    key: `scenario:${choice.scenarioId}`,
    title,
    subtitle: t('turnGuide.groupTypes.scenario'),
    imagePath: cardCodeImage(choice.scenarioId),
    imageAlt: title,
    imageKind: 'landscape-card',
  }
}

function resolveChaosTokenGroup(choice: ChaosTokenLabel, t: Translate): GroupSeed {
  return {
    key: `chaos-token:${choice.face}`,
    title: chaosTokenFaceName(choice.face, t),
    subtitle: t('turnGuide.groupTypes.chaosToken'),
  }
}

function resolveTarotGroup(choice: TarotLabel, t: Translate): GroupSeed {
  const title = tarotName(choice.tarotCard.arcana)
  return {
    key: `tarot:${choice.tarotCard.arcana}`,
    title,
    subtitle: t('turnGuide.groupTypes.tarot'),
    imagePath: tarotImage(choice.tarotCard.arcana),
    imageAlt: title,
    imageKind: 'tarot',
  }
}

function resolveCardPileGroup(game: Game, choice: CardPile, t: Translate): GroupSeed {
  const firstCard = choice.pile[0]
  if (firstCard?.cardOwner) {
    return {
      key: `pile:${firstCard.cardOwner}`,
      title: investigatorName(game, firstCard.cardOwner),
      subtitle: t('turnGuide.groupTypes.pile'),
    }
  }

  return {
    key: 'pile:generic',
    title: t('turnGuide.cardPile'),
    subtitle: t('turnGuide.groupTypes.pile'),
  }
}

function resolveAbilityGroup(game: Game, choice: AbilityLabel, t: Translate): GroupSeed {
  return resolveSourceGroup(game, choice.ability.source, t) ?? investigatorGroup(game, choice.investigatorId, t)
}

function resolveComponentGroup(game: Game, component: Component, t: Translate): GroupSeed {
  switch (component.tag) {
    case 'InvestigatorComponent':
      return investigatorGroup(game, component.investigatorId, t)
    case 'InvestigatorDeckComponent':
      return {
        ...investigatorGroup(game, component.investigatorId, t),
        subtitle: t('turnGuide.groupTypes.deck'),
      }
    case 'AssetComponent': {
      const asset = game.assets[component.assetId]
      return {
        key: `asset:${component.assetId}`,
        title: asset ? cardName(asset.cardCode, t) : t('turnGuide.unknownTarget'),
        subtitle: t('turnGuide.groupTypes.asset'),
      }
    }
  }
}

function resolveTargetGroup(game: Game, choice: TargetLabel, t: Translate): GroupSeed {
  const target = choice.target

  switch (target.tag) {
    case 'InvestigatorTarget':
      return investigatorGroup(game, asTargetId(target), t)
    case 'ActTarget':
      return actGroup(game, asTargetId(target), t)
    case 'AgendaTarget':
      return agendaGroup(game, asTargetId(target), t)
    case 'EnemyTarget':
      return resolveEnemyGroup(game, asTargetId(target), t)
    case 'LocationTarget':
      return locationGroup(game, asTargetId(target), t)
    case 'AssetTarget':
      return assetGroup(game, asTargetId(target), t)
    case 'EventTarget':
      return eventGroup(game, asTargetId(target), t)
    case 'TreacheryTarget':
      return treacheryGroup(game, asTargetId(target), t)
    case 'CardIdTarget':
      return cardByIdGroup(game, asTargetId(target), t)
    case 'CardCodeTarget':
      return cardCodeGroup(asTargetId(target), t)
    case 'StoryTarget':
      return storyGroup(game, asTargetId(target), t)
    case 'ScenarioTarget':
      return scenarioSourceGroup(game, t)
    case 'ScenarioDeckTarget':
      return {
        key: 'scenario-deck',
        title: t('turnGuide.scenarioDeck'),
        subtitle: t('turnGuide.groupTypes.scenario'),
      }
    case 'EncounterDeckTarget':
      return {
        key: 'encounter-deck',
        title: t('turnGuide.encounterDeck'),
        subtitle: t('turnGuide.groupTypes.deck'),
        imagePath: 'encounter_back.jpg',
        imageAlt: t('turnGuide.encounterDeck'),
        imageKind: 'card',
      }
    case 'ChaosTokenTarget':
    case 'ChaosTokenFaceTarget':
      return resolveChaosBagGroup(t)
    default:
      return inferGroupFromUnknownId(game, target.contents, t) ?? {
        key: `target:${target.tag}:${String(target.contents ?? '')}`,
        title: t('turnGuide.unknownTarget'),
        subtitle: t('turnGuide.groupTypes.target'),
      }
  }
}

function resolveSourceGroup(game: Game, source: Source, t: Translate): GroupSeed | null {
  switch (source.tag) {
    case 'ProxySource':
      return resolveSourceGroup(game, source.source, t)
    case 'ActSource':
      return actGroup(game, source.contents, t)
    case 'AgendaSource':
      return agendaGroup(game, source.contents, t)
    case 'ScenarioSource':
    case 'CampaignSource':
      return scenarioSourceGroup(game, t)
    case 'InvestigatorSource':
      return investigatorAbilityGroup(game, source.contents, t)
    case 'AssetSource':
      return assetGroup(game, source.contents, t)
    case 'EventSource':
      return eventGroup(game, source.contents, t)
    case 'TreacherySource':
      return treacheryGroup(game, source.contents, t)
    case 'EnemySource':
      return resolveEnemyGroup(game, source.contents, t)
    case 'LocationSource':
      return locationGroup(game, source.contents, t)
    case 'AbilitySource': {
      const [inner] = source.contents
      return resolveSourceGroup(game, inner, t)
    }
    case 'TarotSource':
      return {
        key: `tarot:${source.contents.arcana}`,
        title: tarotName(source.contents.arcana),
        subtitle: t('turnGuide.groupTypes.tarot'),
      }
    default:
      return inferGroupFromUnknownId(game, 'contents' in source ? source.contents : undefined, t)
  }
}

function inferGroupFromUnknownId(game: Game, raw: unknown, t: Translate): GroupSeed | null {
  if (typeof raw !== 'string') {
    return null
  }

  if (game.investigators[raw] || game.otherInvestigators[raw]) {
    return investigatorGroup(game, raw, t)
  }
  if (game.assets[raw]) {
    return assetGroup(game, raw, t)
  }
  if (game.events[raw]) {
    return eventGroup(game, raw, t)
  }
  if (game.enemies[raw]) {
    return resolveEnemyGroup(game, raw, t)
  }
  if (game.locations[raw]) {
    return locationGroup(game, raw, t)
  }
  if (game.treacheries[raw]) {
    return treacheryGroup(game, raw, t)
  }
  if (game.cards[raw]) {
    return cardByIdGroup(game, raw, t)
  }

  return null
}

function investigatorGroup(game: Game, investigatorId: string, t: Translate): GroupSeed {
  return {
    key: `investigator:${investigatorId}`,
    title: investigatorName(game, investigatorId),
    subtitle: t('turnGuide.groupTypes.investigator'),
    imagePath: investigatorPortraitImage(game, investigatorId),
    imageAlt: investigatorName(game, investigatorId),
    imageKind: 'portrait',
  }
}

function investigatorAbilityGroup(game: Game, investigatorId: string, t: Translate): GroupSeed {
  return {
    ...investigatorGroup(game, investigatorId, t),
  }
}

function actGroup(game: Game, actId: string, t: Translate): GroupSeed {
  const act = game.acts[actId]
  const title = act ? `${t('turnGuide.groupTypes.act')} ${act.sequence.number}${String(act.sequence.side).toUpperCase()}` : t('turnGuide.groupTypes.act')

  return {
    key: `act:${actId}`,
    title,
    subtitle: t('turnGuide.groupTypes.scenario'),
    imagePath: act ? actImage(act.id, act.sequence.side) : undefined,
    imageAlt: title,
    imageKind: act ? 'landscape-card' : undefined,
  }
}

function agendaGroup(game: Game, agendaId: string, t: Translate): GroupSeed {
  const agenda = game.agendas[agendaId]
  const title = agenda
    ? `${t('turnGuide.groupTypes.agenda')} ${agenda.sequence.step}${String(agenda.sequence.side).toUpperCase()}`
    : t('turnGuide.groupTypes.agenda')

  return {
    key: `agenda:${agendaId}`,
    title,
    subtitle: t('turnGuide.groupTypes.scenario'),
    imagePath: agenda ? agendaImage(agenda.id, agenda.flipped) : undefined,
    imageAlt: title,
    imageKind: agenda ? 'landscape-card' : undefined,
  }
}

function scenarioSourceGroup(game: Game, t: Translate): GroupSeed {
  const title = game.scenario?.name.title || t('turnGuide.groupTypes.scenario')

  return {
    key: 'scenario:current',
    title,
    subtitle: t('turnGuide.groupTypes.scenario'),
    imagePath: game.scenario ? scenarioReferenceImage(game.scenario.reference, game.scenario.difficulty) : undefined,
    imageAlt: title,
    imageKind: game.scenario ? 'landscape-card' : undefined,
  }
}

function assetGroup(game: Game, assetId: string, t: Translate): GroupSeed {
  const asset = game.assets[assetId]
  const title = asset ? cardName(asset.cardCode, t) : t('turnGuide.unknownTarget')

  return {
    key: `asset:${assetId}`,
    title,
    subtitle: t('turnGuide.groupTypes.asset'),
    imagePath: asset ? assetImage(asset.cardCode, asset.flipped, asset.mutated) : undefined,
    imageAlt: title,
    imageKind: asset ? 'card' : undefined,
  }
}

function eventGroup(game: Game, eventId: string, t: Translate): GroupSeed {
  const event = game.events[eventId]
  const title = event ? cardName(event.cardCode, t) : t('turnGuide.unknownTarget')

  return {
    key: `event:${eventId}`,
    title,
    subtitle: t('turnGuide.groupTypes.event'),
    imagePath: event ? eventImage(event.cardCode, event.mutated) : undefined,
    imageAlt: title,
    imageKind: event ? 'card' : undefined,
  }
}

function treacheryGroup(game: Game, treacheryId: string, t: Translate): GroupSeed {
  const treachery = game.treacheries[treacheryId]
  const title = treachery ? cardName(treachery.cardCode, t) : t('turnGuide.unknownTarget')

  return {
    key: `treachery:${treacheryId}`,
    title,
    subtitle: t('turnGuide.groupTypes.treachery'),
    imagePath: treachery ? cardCodeImage(treachery.cardCode) : undefined,
    imageAlt: title,
    imageKind: treachery ? 'card' : undefined,
  }
}

function locationGroup(game: Game, locationId: string, t: Translate): GroupSeed {
  const location = game.locations[locationId]
  const title = location ? location.label || cardName(location.cardCode, t) : t('turnGuide.unknownTarget')

  return {
    key: `location:${locationId}`,
    title,
    subtitle: t('turnGuide.groupTypes.location'),
    imagePath: location ? locationImage(location.cardCode, location.revealed) : undefined,
    imageAlt: title,
    imageKind: location ? 'card' : undefined,
  }
}

function cardByIdGroup(game: Game, cardId: string, t: Translate): GroupSeed {
  const card = game.cards[cardId]
  const title = card ? cardName(toCardContents(card).cardCode, t) : t('turnGuide.cardPile')

  return {
    key: `card-id:${cardId}`,
    title,
    subtitle: t('turnGuide.groupTypes.card'),
    imagePath: card ? cardImage(card) : undefined,
    imageAlt: title,
    imageKind: card ? 'card' : undefined,
  }
}

function cardCodeGroup(cardCode: string, t: Translate): GroupSeed {
  const title = cardName(cardCode, t)

  return {
    key: `card-code:${cardCode}`,
    title,
    subtitle: t('turnGuide.groupTypes.card'),
    imagePath: cardCodeImage(cardCode),
    imageAlt: title,
    imageKind: 'card',
  }
}

function storyGroup(game: Game, storyId: string, t: Translate): GroupSeed {
  const story = game.stories[storyId]
  const title = story ? cardName(story.cardId, t) : t('turnGuide.groupTypes.story')

  return {
    key: `story:${storyId}`,
    title,
    subtitle: t('turnGuide.groupTypes.story'),
    imagePath: story ? `cards/${story.art.replace(/^c/, '')}.avif` : undefined,
    imageAlt: title,
    imageKind: story ? 'card' : undefined,
  }
}

function resolveChaosBagGroup(t: Translate): GroupSeed {
  return {
    key: 'chaos-bag',
    title: t('turnGuide.chaosBag'),
    subtitle: t('turnGuide.groupTypes.chaosToken'),
  }
}

function targetActionLabel(target: Target, t: Translate): string {
  switch (target.tag) {
    case 'InvestigatorTarget':
      return t('turnGuide.selectInvestigator')
    case 'ActTarget':
    case 'AgendaTarget':
    case 'ScenarioTarget':
      return t('turnGuide.selectScenario')
    case 'CardIdTarget':
    case 'CardCodeTarget':
    case 'StoryTarget':
      return t('turnGuide.selectCard')
    case 'ScenarioDeckTarget':
      return t('turnGuide.selectDeck')
    case 'EncounterDeckTarget':
      return t('turnGuide.drawEncounter')
    case 'ChaosTokenTarget':
    case 'ChaosTokenFaceTarget':
      return t('turnGuide.selectChaosToken')
    default:
      return t('turnGuide.selectTarget')
  }
}

function componentAction(component: Component, t: Translate): { label: string, iconPath?: string, iconAlt?: string } {
  switch (component.tag) {
    case 'InvestigatorComponent':
      if (component.tokenType === 'ResourceToken') {
        return {
          label: t('turnGuide.gainResource'),
          iconPath: 'resource.png',
          iconAlt: t('turnGuide.componentTokens.ResourceToken'),
        }
      }
      return { label: t('turnGuide.adjustToken', { token: tokenTypeLabel(component.tokenType, t) }) }
    case 'AssetComponent':
      return { label: t('turnGuide.adjustToken', { token: tokenTypeLabel(component.tokenType, t) }) }
    case 'InvestigatorDeckComponent':
      return {
        label: t('turnGuide.drawCard'),
        iconPath: 'player_card.png',
        iconAlt: t('turnGuide.selectCard'),
      }
  }
}

function investigatorName(game: Game, investigatorId: string): string {
  const investigator = game.investigators[investigatorId] ?? game.otherInvestigators[investigatorId]
  return investigator ? fullName(investigator.name) : investigatorId
}

function enemyName(game: Game, enemyId: string, t: Translate): string {
  const enemy = game.enemies[enemyId]
  return enemy ? cardName(enemy.cardCode, t) : t('turnGuide.unknownTarget')
}

function cardName(cardCode: string, _t: Translate): string {
  const store = useDbCardStore()
  const card = store.getDbCard(cardCode.replace(/^c/, ''))
  return card?.name ?? cardCode.replace(/^c/, '')
}

function cardCodeImage(cardCode: string) {
  return `cards/${cardCode.replace(/^c/, '')}.avif`
}

function investigatorPortraitImage(game: Game, investigatorId: string, forceEnded = false) {
  const investigator = game.investigators[investigatorId] ?? game.otherInvestigators[investigatorId]
  if (!investigator) {
    return `portraits/${investigatorId.replace(/^c/, '')}${forceEnded ? 'b' : ''}.jpg`
  }

  const suffix = forceEnded || investigator.endedTurn ? 'b' : ''
  if (investigator.form.tag === 'YithianForm' || investigator.form.tag === 'HomunculusForm') {
    return `portraits/${investigatorId.replace(/^c/, '')}${suffix}.jpg`
  }

  return `portraits/${investigator.cardCode.replace(/^c/, '')}${suffix}.jpg`
}

function investigatorCategoryImage(game: Game, playerId: string, t: Translate) {
  const investigator = Object.values(game.investigators).find((entry) => entry.playerId === playerId)
    ?? Object.values(game.otherInvestigators).find((entry) => entry.playerId === playerId)

  if (!investigator) {
    return {
      imagePath: 'lead-investigator.png',
      imageAlt: categoryTitle('investigator', t),
      imageKind: 'icon' as const,
    }
  }

  return {
    imagePath: investigatorPortraitImage(game, investigator.id),
    imageAlt: fullName(investigator.name),
    imageKind: 'portrait' as const,
  }
}

function enemyImage(cardCode: string, flipped: boolean) {
  return `cards/${cardCode.replace(/^c/, '')}${flipped ? 'b' : ''}.avif`
}

function locationImage(cardCode: string, revealed: boolean) {
  return `cards/${cardCode.replace(/^c/, '')}${revealed ? '' : 'b'}.avif`
}

function assetImage(cardCode: string, flipped: boolean, mutated?: string) {
  if (flipped) {
    if (cardCode === 'c90052') {
      return 'cards/90052b.avif'
    }
    if (cardCode === 'c88043') {
      return 'cards/88043b.avif'
    }
  }

  return `cards/${cardCode.replace(/^c/, '')}${mutated ? `_${mutated}` : ''}.avif`
}

function eventImage(cardCode: string, mutated?: string) {
  return `cards/${cardCode.replace(/^c/, '')}${mutated ? `_${mutated}` : ''}.avif`
}

function actImage(actId: string, side: string) {
  const normalizedSide = side.toLowerCase().replace('a', '')
  const sidePart = actId.endsWith(normalizedSide) ? '' : normalizedSide

  let newId = normalizedSide === 'b' && actId === 'c10607a' ? '10607' : actId.replace(/^c/, '')

  if (sidePart === 'd') {
    newId = newId.replace(/c$/, '')
  }

  if (sidePart === 'f') {
    newId = newId.replace(/e$/, '')
  }

  if (sidePart === 'h') {
    newId = newId.replace(/g$/, '')
  }

  // Threads of Fate side mapping
  if (parseInt(newId, 10) >= 4117 && parseInt(newId, 10) <= 4140) {
    const adjustedSidePart = sidePart.replace(/[ace]/, '').replace(/[df]/, 'b')
    return `cards/${newId}${adjustedSidePart}.avif`
  }

  // Scarlet Keys multi-side mapping
  if (parseInt(newId, 10) >= 53029 && parseInt(newId, 10) <= 53036) {
    const adjustedSidePart = sidePart.replace(/[g]/, '').replace(/[h]/, 'b')
    return `cards/${newId}${adjustedSidePart}.avif`
  }

  return `cards/${newId}${sidePart}.avif`
}

function agendaImage(agendaId: string, flipped: boolean) {
  if (flipped) {
    if (['c03276a', 'c03279a'].includes(agendaId)) {
      return `cards/${agendaId.replace(/^c/, '')}b.avif`
    }

    return `cards/${agendaId.replace(/^c/, '').replace(/a$/, '')}b.avif`
  }

  return `cards/${agendaId.replace(/^c/, '')}.avif`
}

function scenarioReferenceImage(reference: string, difficulty: Difficulty) {
  const difficultySuffix = difficulty === 'Hard' || difficulty === 'Expert' ? 'b' : ''
  return `cards/${reference.replace(/^c/, '')}${difficultySuffix}.avif`
}

function tarotImage(arcana: TarotCardArcana) {
  return `tarot/${tarotCardImage({ arcana, facing: 'Upright', scope: { tag: 'GlobalTarot' } })}`
}

function chaosTokenFaceName(face: string, t: Translate): string {
  const token = face.replace(/^Plus/, '').replace(/^Minus/, '')
  const key = `turnGuide.chaosFaces.${token}`
  const translated = t(key)
  return translated === key ? face : translated
}

function tarotName(arcana: string) {
  return arcana
    .replace(/([A-Z])/g, ' $1')
    .replace(/\s+/g, ' ')
    .trim()
}

function asTargetId(target: Target): string {
  return typeof target.contents === 'string' ? target.contents : ''
}

function signatureForQuestion(question: Question | undefined): string {
  if (!question) {
    return 'none'
  }

  return JSON.stringify(question)
}

function signatureForPrompt(prompt: InlinePrompt | null): string {
  if (!prompt) {
    return 'none'
  }

  switch (prompt.kind) {
    case 'dropdown':
      return `dropdown:${prompt.options.map((option) => option.label).join('|')}`
    case 'amounts':
    case 'payment-amounts':
      return `${prompt.kind}:${prompt.fields.map((field) => `${field.key}:${field.min}-${field.max}`).join('|')}`
    case 'exchange-amounts':
      return `${prompt.kind}:${prompt.investigator1Id}:${prompt.investigator2Id}:${prompt.token}`
  }
}

function displayAbilityLabel(choice: AbilityLabel, t: Translate): string {
  const summary = summarizeAbility(choice, t)
  if (summary !== t('turnGuide.useAbility')) {
    return summary
  }

  return fallbackAbilityLabel(choice.ability.source, t) ?? summary
}

function fallbackAbilityLabel(source: Source, t: Translate): string | null {
  const rootSource = unwrapSource(source)

  switch (rootSource.tag) {
    case 'ActSource':
      return t('turnGuide.advanceAct')
    case 'AgendaSource':
      return t('turnGuide.advanceAgenda')
    case 'ScenarioSource':
      return t('turnGuide.advanceScenario')
    case 'CampaignSource':
      return t('turnGuide.scenarioAction')
    default:
      return null
  }
}

function unwrapSource(source: Source): Source {
  switch (source.tag) {
    case 'ProxySource':
      return unwrapSource(source.source)
    case 'AbilitySource': {
      const [inner] = source.contents
      return unwrapSource(inner)
    }
    default:
      return source
  }
}

function summarizeAbility(choice: AbilityLabel, t: Translate): string {
  const { ability } = choice

  if (ability.displayAs === 'DisplayAsAction' && ability.type.tag === 'ActionAbility' && ability.type.actions.length === 1) {
    return actionName(ability.type.actions[0], t)
  }

  if (ability.tooltip) {
    const tooltip = normalizePromptText(ability.tooltip, t)
    if (tooltip.length > 0) {
      return tooltip
    }
  }

  switch (ability.type.tag) {
    case 'ActionAbility':
      if (ability.type.actions.length === 1) {
        return actionName(ability.type.actions[0], t)
      }
      if (ability.type.actions.length > 1) {
        return ability.type.actions.map((action) => actionName(action, t)).join(' / ')
      }
      return t('turnGuide.useAbility')
    case 'CustomizationReaction':
    case 'ConstantReaction':
      return normalizePromptText(ability.type.label, t)
    case 'ServitorAbility':
      return actionName(ability.type.action, t)
    default:
      return t('turnGuide.useAbility')
  }
}

function actionName(action: Action, t: Translate): string {
  return t(`turnGuide.actionNames.${action}`)
}

function skillName(skillType: SkillType, t: Translate): string {
  switch (skillType) {
    case 'SkillWillpower':
      return t('turnGuide.skills.willpower')
    case 'SkillIntellect':
      return t('turnGuide.skills.intellect')
    case 'SkillCombat':
      return t('turnGuide.skills.combat')
    case 'SkillAgility':
      return t('turnGuide.skills.agility')
    case 'SkillWild':
      return t('turnGuide.skills.wild')
  }
}

function tokenTypeLabel(tokenType: string, t: Translate): string {
  return t(`turnGuide.componentTokens.${tokenType}`)
}
