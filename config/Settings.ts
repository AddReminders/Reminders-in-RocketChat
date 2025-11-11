import {
	ISetting,
	SettingType,
} from '@rocket.chat/apps-engine/definition/settings';
import { TimeFormats } from '../enums/Ui';
import { Language } from '../lib/Translation/translation';

export enum AppSetting {
	ShowAddReminderButton = 'showAddReminderButton',
	ShowViewAllReminderButton = 'showViewAllReminderButton',
	ShowManageAllReminderButton = 'showManageAllReminderButton',
	BackupChannel = 'backupChannel',
	BackupInterval = 'backupInterval',
	BackupUser = 'backupUser',
	BackupEncrypted = 'backupEncrypted',
	SendOutDailyReminderSummary = 'sendOutDailyReminderSummary',
	DefaultLanguagePreference = 'defaultLanguagePreference',
	DefaultTimeFormatPreference = 'defaultTimeFormatPreference',
}

export enum ServerSetting {
	SITE_URL = 'Site_Url',
}

export enum BackupInterval {
	Daily = 'daily',
	Weekly = 'weekly',
	Monthly = 'monthly',
}

export const settings: Array<ISetting> = [
	{
		id: AppSetting.DefaultLanguagePreference,
		i18nLabel: 'default_language_preference',
		i18nDescription: 'default_language_preference_description',
		required: false,
		type: SettingType.SELECT,
		public: true,
		values: Object.keys(Language).map((key) => ({
			key,
			i18nLabel: `language_${key}`,
		})),
		packageValue: Language.en,
		value: Language.en,
	},
	{
		id: AppSetting.DefaultTimeFormatPreference,
		i18nLabel: 'default_time_format_preference',
		i18nDescription: 'default_time_format_preference_description',
		required: false,
		type: SettingType.SELECT,
		public: true,
		values: [
			{
				key: TimeFormats._12,
				i18nLabel: 'time_format_12_hour',
			},
			{
				key: TimeFormats._24,
				i18nLabel: 'time_format_24_hour',
			},
		],
		packageValue: TimeFormats._12,
		value: TimeFormats._12,
	},
	{
		id: AppSetting.SendOutDailyReminderSummary,
		i18nLabel: 'send_out_daily_reminder_summary',
		i18nDescription: 'send_out_daily_reminder_summary_description',
		required: false,
		type: SettingType.BOOLEAN,
		public: true,
		packageValue: true,
		value: true,
	},
	{
		id: AppSetting.BackupChannel,
		i18nLabel: 'backup_channel',
		i18nDescription: 'backup_channel_description',
		required: true,
		type: SettingType.STRING,
		public: false,
		packageValue: 'reminder-app-backup',
		value: 'reminder-app-backup',
	},
	{
		id: AppSetting.BackupInterval,
		i18nLabel: 'backup_interval',
		i18nDescription: 'backup_interval_description',
		required: false,
		type: SettingType.SELECT,
		public: true,
		values: [
			{
				key: BackupInterval.Daily,
				i18nLabel: 'daily',
			},
			{
				key: BackupInterval.Weekly,
				i18nLabel: 'weekly',
			},
			{
				key: BackupInterval.Monthly,
				i18nLabel: 'monthly',
			},
		],
		packageValue: BackupInterval.Daily,
		value: BackupInterval.Daily,
	},
	{
		id: AppSetting.BackupUser,
		i18nLabel: 'backup_user',
		i18nDescription: 'backup_user_description',
		required: false,
		type: SettingType.STRING,
		public: true,
		packageValue: 'rocket.cat',
		value: 'rocket.cat',
		section: 'backup',
	},
	{
		id: AppSetting.BackupEncrypted,
		i18nLabel: 'backup_encrypted',
		i18nDescription: 'backup_encrypted_description',
		required: false,
		type: SettingType.BOOLEAN,
		public: true,
		packageValue: true,
		value: true,
	},
	{
		id: AppSetting.ShowAddReminderButton,
		i18nLabel: 'show_add_reminder_button',
		i18nDescription: 'show_add_reminder_button_description',
		required: false,
		type: SettingType.BOOLEAN,
		public: true,
		packageValue: true,
		value: true,
	},
	{
		id: AppSetting.ShowViewAllReminderButton,
		i18nLabel: 'show_view_all_reminder_button',
		i18nDescription: 'show_view_all_reminder_button_description',
		required: false,
		type: SettingType.BOOLEAN,
		public: true,
		packageValue: true,
		value: true,
	},
	{
		id: AppSetting.ShowManageAllReminderButton,
		i18nLabel: 'show_manage_all_reminder_button',
		i18nDescription: 'show_manage_all_reminder_button_description',
		required: false,
		type: SettingType.BOOLEAN,
		public: true,
		packageValue: true,
		value: true,
	},
];
