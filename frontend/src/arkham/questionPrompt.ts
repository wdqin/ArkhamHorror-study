import type { Message } from '@/arkham/types/Message'
import type { Question, AmountTarget } from '@/arkham/types/Question'
import { QuestionType } from '@/arkham/types/Question'
import type { Token } from '@/arkham/types/Token'
import type { Source } from '@/arkham/types/Source'
import { handleI18n } from '@/arkham/i18n'

type Translate = (key: string, params?: Record<string, unknown>) => string

export interface PromptOption {
  key: string
  label: string
  choiceIndex: number
}

export interface PromptField {
  key: string
  label: string
  min: number
  max: number
}

export type InlinePrompt =
  | {
      kind: 'dropdown'
      label: string
      options: PromptOption[]
    }
  | {
      kind: 'amounts'
      label: string
      fields: PromptField[]
      target: AmountTarget
      submitLabel: string
    }
  | {
      kind: 'payment-amounts'
      label: string
      fields: PromptField[]
      target: AmountTarget | null
      submitLabel: string
    }
  | {
      kind: 'exchange-amounts'
      label: string
      investigator1Id: string
      investigator2Id: string
      investigator1Amount: number
      investigator2Amount: number
      token: Token
      source: Source
      submitLabel: string
    }

export function normalizePromptText(text: string, t: Translate): string {
  if (!text || text === '@none') {
    return ''
  }

  const localized = text.startsWith('$')
    ? handleI18n(text, t as (key: string, params: { [key: string]: any }) => string)
    : text

  return localized
    .replace(/_([^_]*)_/g, '$1')
    .replace(/\*([^\*]*)\*/g, '$1')
    .replace(/\{([a-zA-Z]+)\}/g, (_match, token: string) => tokenName(token, t))
    .replace(/\s+/g, ' ')
    .trim()
}

export function inlinePromptForQuestion(question: Question | undefined, t: Translate): InlinePrompt | null {
  if (!question) {
    return null
  }

  switch (question.tag) {
    case QuestionType.DROP_DOWN:
      return {
        kind: 'dropdown',
        label: t('turnGuide.chooseOneOption'),
        options: question.options.map((option, index) => ({
          key: `dropdown-${index}`,
          label: normalizePromptText(option, t),
          choiceIndex: index,
        })),
      }
    case QuestionType.CHOOSE_AMOUNTS:
      return {
        kind: 'amounts',
        label: normalizePromptText(question.label, t),
        fields: question.amountChoices
          .filter((choice) => choice.maxBound !== 0)
          .map((choice) => ({
            key: choice.choiceId,
            label: normalizePromptText(choice.label, t),
            min: choice.minBound,
            max: choice.maxBound,
          })),
        target: question.amountTargetValue,
        submitLabel: t('turnGuide.submit'),
      }
    case QuestionType.CHOOSE_PAYMENT_AMOUNTS:
      return {
        kind: 'payment-amounts',
        label: normalizePromptText(question.label, t),
        fields: question.paymentAmountChoices
          .filter((choice) => choice.maxBound !== 0)
          .map((choice) => ({
            key: choice.choiceId,
            label: normalizePromptText(choice.title, t),
            min: choice.minBound,
            max: choice.maxBound,
          })),
        target: question.paymentAmountTargetValue,
        submitLabel: t('turnGuide.submit'),
      }
    case QuestionType.CHOOSE_EXCHANGE_AMOUNTS:
      return {
        kind: 'exchange-amounts',
        label: t('turnGuide.exchangeTokens'),
        investigator1Id: question.investigator1Id,
        investigator2Id: question.investigator2Id,
        investigator1Amount: question.investigator1InitialAmount,
        investigator2Amount: question.investigator2InitialAmount,
        token: question.token,
        source: question.source,
        submitLabel: t('exchange'),
      }
    case QuestionType.QUESTION_LABEL:
      if (question.question.tag === QuestionType.DROP_DOWN) {
        return {
          kind: 'dropdown',
          label: normalizePromptText(question.label, t) || t('turnGuide.chooseOneOption'),
          options: question.question.options.map((option, index) => ({
            key: `dropdown-${index}`,
            label: normalizePromptText(option, t),
            choiceIndex: index,
          })),
        }
      }

      if (question.question.tag === QuestionType.CHOOSE_AMOUNTS) {
        return {
          kind: 'amounts',
          label: normalizePromptText(question.question.label, t),
          fields: question.question.amountChoices
            .filter((choice) => choice.maxBound !== 0)
            .map((choice) => ({
              key: choice.choiceId,
              label: normalizePromptText(choice.label, t),
              min: choice.minBound,
              max: choice.maxBound,
            })),
          target: question.question.amountTargetValue,
          submitLabel: t('turnGuide.submit'),
        }
      }

      return null
    default:
      return null
  }
}

export function initialInlinePromptSelections(prompt: InlinePrompt | null): Record<string, number> {
  if (!prompt) {
    return {}
  }

  switch (prompt.kind) {
    case 'amounts':
    case 'payment-amounts':
      return prompt.fields.reduce<Record<string, number>>((acc, field) => {
        acc[field.key] = 0
        return acc
      }, {})
    case 'exchange-amounts':
      return { amount: 0 }
    default:
      return {}
  }
}

export function inlinePromptHasUnmetRequirements(prompt: InlinePrompt | null, values: Record<string, number>): boolean {
  if (!prompt) {
    return false
  }

  switch (prompt.kind) {
    case 'amounts':
      return amountTargetUnmet(prompt.target, values)
    case 'payment-amounts':
      return prompt.target ? amountTargetUnmet(prompt.target, values) : false
    case 'exchange-amounts': {
      const amount = values.amount ?? 0
      return prompt.investigator1Amount - amount < 0 || prompt.investigator2Amount + amount < 0
    }
    default:
      return false
  }
}

function amountTargetUnmet(target: AmountTarget, values: Record<string, number>) {
  const total = Object.values(values).reduce((a, b) => a + b, 0)

  switch (target.tag) {
    case 'MaxAmountTarget':
      return target.contents ? total > target.contents : false
    case 'MinAmountTarget':
      return target.contents ? total < target.contents : false
    case 'TotalAmountTarget':
      return target.contents ? total !== target.contents : false
    case 'AmountOneOf':
      return target.contents.length > 0 ? !target.contents.includes(total) : false
  }
}

export function questionInstructionText(question: Question | undefined, highlightedCount: number, t: Translate): string {
  if (question) {
    switch (question.tag) {
      case QuestionType.QUESTION_LABEL: {
        const text = normalizePromptText(question.label, t)
        if (text.length > 0) {
          return text
        }
        break
      }
      case QuestionType.CHOOSE_AMOUNTS:
      case QuestionType.CHOOSE_PAYMENT_AMOUNTS: {
        const text = normalizePromptText(question.label, t)
        if (text.length > 0) {
          return text
        }
        break
      }
      case QuestionType.DROP_DOWN:
        return t('turnGuide.chooseOneOption')
    }
  }

  if (highlightedCount > 0) {
    return t('turnGuide.clickHighlighted')
  }

  return t('turnGuide.chooseAvailable')
}

function tokenName(token: string, t: Translate): string {
  switch (token) {
    case 'action':
      return t('turnGuide.tokens.action')
    case 'fast':
      return t('turnGuide.tokens.fast')
    case 'reaction':
      return t('turnGuide.tokens.reaction')
    case 'willpower':
      return t('turnGuide.tokens.willpower')
    case 'intellect':
      return t('turnGuide.tokens.intellect')
    case 'combat':
      return t('turnGuide.tokens.combat')
    case 'agility':
      return t('turnGuide.tokens.agility')
    case 'wild':
      return t('turnGuide.tokens.wild')
    case 'skull':
      return t('turnGuide.tokens.skull')
    case 'cultist':
      return t('turnGuide.tokens.cultist')
    case 'tablet':
      return t('turnGuide.tokens.tablet')
    case 'elderThing':
      return t('turnGuide.tokens.elderThing')
    case 'bless':
      return t('turnGuide.tokens.bless')
    case 'curse':
      return t('turnGuide.tokens.curse')
    case 'frost':
      return t('turnGuide.tokens.frost')
    case 'elderSign':
      return t('turnGuide.tokens.elderSign')
    case 'autoFail':
      return t('turnGuide.tokens.autoFail')
    default:
      return token
  }
}
