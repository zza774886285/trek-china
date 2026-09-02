import en from '../en/externalNotifications';
import zh from '../zh/externalNotifications';
import type {
  NotificationLocale,
  EmailStrings,
  EventTextFn,
  PasswordResetStrings,
  NotificationEventKey,
} from './types';

export * from './types';

const LOCALES = {
  en,
  zh,
} satisfies Record<string, NotificationLocale>;

export const EMAIL_I18N: Record<string, EmailStrings> = Object.fromEntries(
  Object.entries(LOCALES).map(([k, v]) => [k, v.email]),
);

export const EVENT_TEXTS: Record<string, Record<NotificationEventKey, EventTextFn>> = Object.fromEntries(
  Object.entries(LOCALES).map(([k, v]) => [k, v.events]),
);

export const PASSWORD_RESET_I18N: Record<string, PasswordResetStrings> = Object.fromEntries(
  Object.entries(LOCALES).map(([k, v]) => [k, v.passwordReset]),
);
