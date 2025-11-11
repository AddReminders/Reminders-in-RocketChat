import {
	IAppAccessors,
	IAppInstallationContext,
	IConfigurationExtend,
	IEnvironmentRead,
	IHttp,
	ILogger,
	IModify,
	IPersistence,
	IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
	ApiVisibility,
	ApiSecurity,
} from '@rocket.chat/apps-engine/definition/api';
import { App } from '@rocket.chat/apps-engine/definition/App';

import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import {
	RoomTypeFilter,
	UIActionButtonContext,
} from '@rocket.chat/apps-engine/definition/ui';
import {
	IUIKitInteractionHandler,
	IUIKitResponse,
	UIKitBlockInteractionContext,
	UIKitViewCloseInteractionContext,
	UIKitViewSubmitInteractionContext,
	UIKitActionButtonInteractionContext,
} from '@rocket.chat/apps-engine/definition/uikit';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { RemindCommand } from './command/RemindCommand';
import { AppSetting, settings } from './config/Settings';
import { RestoreBackup } from './endpoints/RestoreBackup';
import { TimeFormats } from './enums/Ui';
import { ExecuteActionButtonHandler } from './handlers/ExecuteActionButtonHandler';
import { ExecuteBlockActionHandler } from './handlers/ExecuteBlockActionHandler';
import { ExecuteViewSubmitHandler } from './handlers/ExecuteViewSubmitHandler';
import { BackupJob } from './jobs/BackupJob';
import { DailyReminderCalculationJob } from './jobs/DailyReminderCalculationJob';
import { DailyReminderJob } from './jobs/DailyReminderJob';
import { JobsRestartJob } from './jobs/JobsRestartJob';
import { LegacyReminderJob } from './jobs/LegacyReminderJob';
import { ReminderJob } from './jobs/ReminderJob';
import { addMinutesToDate, addSecondsToDate } from './lib/Dates';
import { sendWelcomeMessage } from './lib/Message';
import {
	AppInstaller,
	CustomSnoozeModalUiData,
	ModalClickEventLock,
	MsgReminderCreateModalUiData,
	ReminderCreateModalUiData,
	ReminderListModalActionUiData,
	ReminderListModalUiData,
} from './lib/Persistence/Models';
import { Language } from './lib/Translation/translation';
import { getSiteUrl } from './lib/utils';
import { CustomSnoozeModalViewIdPrefix } from './ui/modals/CustomSnoozeModal/Modal';
import { MsgReminderCreateModalViewIdPrefix } from './ui/modals/MsgReminderCreateModal/Modal';
import { ReminderCreateModalViewIdPrefix } from './ui/modals/TaskCreateModal/Modal';
import { ReminderListModalViewIdPrefix } from './ui/modals/TaskResultModal/Modal';

interface IAppCache {
	[AppSetting.DefaultLanguagePreference]: {
		value: Language;
		expiresAt: Date;
	};
	[AppSetting.DefaultTimeFormatPreference]: {
		value: TimeFormats;
		expiresAt: Date;
	};
	[AppSetting.SendOutDailyReminderSummary]: {
		value: boolean;
		expiresAt: Date;
	};
	appUser: {
		value: IUser;
		expiresAt: Date;
	};
	siteUrl: {
		value: string;
		expiresAt: Date;
	};
}

export class RemindApp extends App implements IUIKitInteractionHandler {
	public appCache: Partial<IAppCache> = {};

	constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
		super(info, logger, accessors);
	}

	public async getCachedValue<T extends keyof IAppCache>(
		v: T,
	): Promise<IAppCache[T]['value']> {
		switch (v) {
			case AppSetting.DefaultLanguagePreference: {
				const cachedValue = this.appCache[v];
				if (cachedValue && cachedValue.expiresAt > new Date()) {
					return cachedValue.value;
				}

				this.getLogger().debug(
					`Recalculating app setting cache: ${v}...`,
				);

				let value: Language = Language.en;
				try {
					value = (
						await this.getAccessors()
							.environmentReader.getSettings()
							.getById(AppSetting.DefaultLanguagePreference)
					).value as Language;
				} catch (e) {
					this.getLogger().error(
						`Error reading app setting: ${v}. Will fallback to ${value}. Error:`,
						e,
					);
				}

				this.appCache[v as AppSetting.DefaultLanguagePreference] = {
					value,
					expiresAt: addSecondsToDate(new Date(), 60),
				};

				return value;
			}
			case AppSetting.DefaultTimeFormatPreference: {
				const cachedValue = this.appCache[v];

				if (cachedValue && cachedValue.expiresAt > new Date()) {
					return cachedValue.value;
				}

				this.getLogger().debug(
					`Recalculating app setting cache: ${v}...`,
				);

				let value: TimeFormats = TimeFormats._12;
				try {
					value = (
						await this.getAccessors()
							.environmentReader.getSettings()
							.getById(AppSetting.DefaultTimeFormatPreference)
					).value as TimeFormats;
				} catch (e) {
					this.getLogger().error(
						`Error reading app setting: ${v}. Will fallback to ${value}. Error:`,
						e,
					);
				}

				this.appCache[v as AppSetting.DefaultTimeFormatPreference] = {
					value,
					expiresAt: addMinutesToDate(new Date(), 60),
				};

				return value;
			}
			case AppSetting.SendOutDailyReminderSummary: {
				const cachedValue = this.appCache[v];

				if (cachedValue && cachedValue.expiresAt > new Date()) {
					return cachedValue.value;
				}

				this.getLogger().debug(
					`Recalculating app setting cache: ${v}...`,
				);

				let value = false;
				try {
					value = (
						await this.getAccessors()
							.environmentReader.getSettings()
							.getById(AppSetting.SendOutDailyReminderSummary)
					).value as boolean;
				} catch (e) {
					this.getLogger().error(
						`Error reading app setting: ${v}. Will fallback to ${value}. Error:`,
						e,
					);
				}

				this.appCache[v as AppSetting.SendOutDailyReminderSummary] = {
					value,
					expiresAt: addMinutesToDate(new Date(), 60),
				};

				return value;
			}
			case 'appUser': {
				const cachedValue = this.appCache[v];

				if (cachedValue && cachedValue.expiresAt > new Date()) {
					return cachedValue.value;
				}

				this.getLogger().debug(
					`Recalculating app setting cache: ${v}...`,
				);

				const appUser = await this.getAccessors()
					.reader.getUserReader()
					.getAppUser(this.getID());
				if (!appUser) {
					throw new Error(
						`No app user found with app id ${this.getID()}`,
					);
				}

				this.appCache[v as 'appUser'] = {
					value: appUser,
					expiresAt: addMinutesToDate(new Date(), 60),
				};

				return appUser;
			}
			case 'siteUrl': {
				const cachedValue = this.appCache[v];

				if (cachedValue && cachedValue.expiresAt > new Date()) {
					return cachedValue.value;
				}

				this.getLogger().debug(
					`Recalculating app setting cache: ${v}...`,
				);

				const siteUrl = await getSiteUrl(
					this.getAccessors().environmentReader,
				);

				this.appCache[v as 'siteUrl'] = {
					value: siteUrl,
					expiresAt: addSecondsToDate(new Date(), 60),
				};

				return siteUrl;
			}
			default: {
				throw new Error(`No cached value found for ${v}`);
			}
		}
	}

	public resetAppCache(): void {
		this.appCache = {};
	}

	public async executeViewClosedHandler(
		context: UIKitViewCloseInteractionContext,
		_read: IRead,
		_http: IHttp,
		persistence: IPersistence,
	): Promise<IUIKitResponse> {
		try {
			const {
				view: { id: viewId },
			} = context.getInteractionData();
			if (!viewId) {
				throw new Error('No viewId found within View closed handler');
			}

			await ModalClickEventLock.clearByQuery(persistence, {
				viewId,
			});

			const formPrefix = viewId.split('-')[0];
			switch (formPrefix) {
				case ReminderCreateModalViewIdPrefix: {
					await ReminderCreateModalUiData.clearByQuery(persistence, {
						viewId,
					});
					break;
				}
				case ReminderListModalViewIdPrefix: {
					await Promise.all([
						ReminderListModalActionUiData.clearByQuery(
							persistence,
							{
								viewId,
							},
						),
						ReminderListModalUiData.clearByQuery(persistence, {
							viewId,
						}),
					]);
					break;
				}
				case MsgReminderCreateModalViewIdPrefix: {
					await MsgReminderCreateModalUiData.clearByQuery(
						persistence,
						{
							viewId,
						},
					);
					break;
				}
				case CustomSnoozeModalViewIdPrefix: {
					await CustomSnoozeModalUiData.clearByQuery(persistence, {
						viewId,
					});
					break;
				}
			}
		} catch (err) {
			this.getLogger().error(err);
		}

		return context.getInteractionResponder().successResponse();
	}

	public async executeViewSubmitHandler(
		context: UIKitViewSubmitInteractionContext,
		read: IRead,
		http: IHttp,
		persistence: IPersistence,
		modify: IModify,
	): Promise<IUIKitResponse> {
		try {
			const handler = new ExecuteViewSubmitHandler(
				this,
				read,
				http,
				modify,
				persistence,
			);
			return await handler.run(context);
		} catch (err) {
			this.getLogger().error(err);
			return context.getInteractionResponder().errorResponse();
		}
	}

	public async executeBlockActionHandler(
		context: UIKitBlockInteractionContext,
		read: IRead,
		http: IHttp,
		persistence: IPersistence,
		modify: IModify,
	) {
		try {
			const handler = new ExecuteBlockActionHandler(
				this,
				read,
				http,
				modify,
				persistence,
			);
			return await handler.run(context);
		} catch (err) {
			this.getLogger().error(err);
			return context.getInteractionResponder().errorResponse();
		}
	}

	public async initialize(
		configuration: IConfigurationExtend,
		environmentRead: IEnvironmentRead,
	): Promise<void> {
		await configuration.slashCommands.provideSlashCommand(
			new RemindCommand(this),
		);
		await configuration.scheduler.registerProcessors([
			new ReminderJob(this).getReminderJob(),
			new LegacyReminderJob(this).getLegacyReminderJob(),
			new JobsRestartJob(this).getJobsRestartJob(),
			new BackupJob(this).getBackupJob(),
			new DailyReminderCalculationJob(this).getDailyPendingJob(),
			new DailyReminderJob(this).getDailyReminderJob(),
		]);

		await configuration.api.provideApi({
			visibility: ApiVisibility.PRIVATE,
			security: ApiSecurity.UNSECURE,
			endpoints: [new RestoreBackup(this)],
		});

		await Promise.all(
			settings.map((setting) =>
				configuration.settings.provideSetting(setting),
			),
		);

		const [
			showAddReminderButton,
			showViewAllReminderButton,
			showManageAllReminderButton,
		] = await Promise.all([
			environmentRead
				.getSettings()
				.getById(AppSetting.ShowAddReminderButton),
			environmentRead
				.getSettings()
				.getById(AppSetting.ShowViewAllReminderButton),
			environmentRead
				.getSettings()
				.getById(AppSetting.ShowManageAllReminderButton),
		]);

		configuration.ui.registerButton({
			actionId: 'remind_me_about_this_msg_action',
			labelI18n: 'remind_me_about_this_msg_action',
			context: UIActionButtonContext.MESSAGE_ACTION,
		});

		if (showAddReminderButton.value !== false) {
			configuration.ui.registerButton({
				actionId: 'add_reminder_message_box_action',
				context: UIActionButtonContext.MESSAGE_BOX_ACTION,
				labelI18n: 'add_reminder_message_box_action',
			});
		}

		if (showViewAllReminderButton.value !== false) {
			configuration.ui.registerButton({
				actionId: 'show_my_reminders_room_action',
				context: UIActionButtonContext.ROOM_ACTION,
				labelI18n: 'show_my_reminders_room_action',
			});
		}

		if (showManageAllReminderButton.value !== false) {
			configuration.ui.registerButton({
				actionId: 'manage_all_reminders_room_action',
				labelI18n: 'manage_all_reminders_room_action',
				context: UIActionButtonContext.ROOM_ACTION,
				when: {
					roomTypes: [
						RoomTypeFilter.PUBLIC_CHANNEL,
						RoomTypeFilter.PUBLIC_TEAM,
						RoomTypeFilter.PUBLIC_DISCUSSION,
						RoomTypeFilter.PRIVATE_CHANNEL,
						RoomTypeFilter.PRIVATE_TEAM,
						RoomTypeFilter.PRIVATE_DISCUSSION,
					],
					hasOneRole: ['admin', 'owner'],
				},
			});
		}
	}

	public async executeActionButtonHandler(
		context: UIKitActionButtonInteractionContext,
		read: IRead,
		http: IHttp,
		persistence: IPersistence,
		modify: IModify,
	): Promise<IUIKitResponse> {
		try {
			const handler = new ExecuteActionButtonHandler(
				this,
				read,
				http,
				modify,
				persistence,
			);
			return await handler.run(context);
		} catch (err) {
			this.getLogger().error(err);
			return context.getInteractionResponder().errorResponse();
		}
	}

	public async onEnable(): Promise<boolean> {
		try {
			this.resetAppCache();
		} catch (err) {
			this.getLogger().error(
				`Something went wrong while resetting the app cache:`,
				err,
			);
		}

		return true;
	}

	public async onInstall(
		context: IAppInstallationContext,
		read: IRead,
		_http: IHttp,
		persistence: IPersistence,
		modify: IModify,
	): Promise<void> {
		this.getLogger().info('RemindApp is getting installed.');

		const { user } = context;
		const appInstaller = {
			userId: user.id,
			date: new Date().toUTCString(),
		};

		this.getLogger().debug(`Saving app installer for user ${user.id}`);

		await AppInstaller.insertOrUpdate(persistence, appInstaller);

		this.getLogger().debug(
			`Successfully saved app installer for user ${user.id}. Sending welcome message to user ${user.id}`,
		);

		await sendWelcomeMessage(this, read, modify, user);

		this.getLogger().debug(
			`Successfully sent welcome message to user ${user.id}.`,
		);

		this.getLogger().info('Successfully installed RemindApp.');
	}

	public async onSettingUpdated(): Promise<void> {
		this.resetAppCache();
	}
}
