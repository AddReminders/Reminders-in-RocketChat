import {
	IRead,
	IHttp,
	IModify,
	IPersistence,
} from '@rocket.chat/apps-engine/definition/accessors';
import { RoomType } from '@rocket.chat/apps-engine/definition/rooms';
import {
	IUIKitResponse,
	UIKitBlockInteractionContext,
} from '@rocket.chat/apps-engine/definition/uikit';
import { IReminder } from '../definitions/IReminder';
import { ReminderRecipientsType, Durations } from '../enums/Ui';
import { Commands } from '../lib/Commands';

import {
	addLinkedMessagePreviewBlock,
	resolveTranslatedRoomName,
	resolveTranslatedUserNameInfo,
	sendRoomMessage,
	updateRoomMessageAfterRemovingPreviousContent,
} from '../lib/Message';
import { Reminder } from '../lib/Persistence/Models';
import {
	postSnoozeReminder,
	snoozeReminder,
	snoozeReminderPreCheck,
} from '../lib/Reminder';
import { Language, t } from '../lib/Translation/translation';
import {
	getUserPreference,
	getUserPreferredLanguage,
} from '../lib/UserPreference';
import {
	getNextSnoozedDateAndMsg,
	isRecurringReminder,
	uuid,
} from '../lib/utils';
import { RemindApp } from '../RemindApp';
import { CustomSnoozeModal } from '../ui/modals/CustomSnoozeModal/Modal';
import { dialogModal } from '../ui/modals/DialogModal';
import { EditReminderModal } from '../ui/modals/EditReminderModal/Modal';
import { msgReminderCreationModal } from '../ui/modals/MsgReminderCreateModal/Modal';
import { setUserPreferenceLanguageModal } from '../ui/modals/SetUserPreferenceModal/Modal';
import { createTaskCreationModal } from '../ui/modals/TaskCreateModal/Modal';
import { bulkDeleteConfirmationModal } from '../ui/modals/TaskResultModal/BulkDeleteConfirmationModal';
import { createReminderListModal } from '../ui/modals/TaskResultModal/Modal';
import { JobId } from '../enums/Jobs';
import { IBackupJobContext } from '../definitions/Jobs';
import { sendRoomNotification } from '../lib/Notification';

export class ExecuteBlockActionHandler {
	constructor(
		private readonly app: RemindApp,
		private readonly read: IRead,
		private readonly http: IHttp,
		private readonly modify: IModify,
		private readonly persistence: IPersistence,
	) {}

	public async run(
		context: UIKitBlockInteractionContext,
	): Promise<IUIKitResponse> {
		const contextData = context.getInteractionData();
		const { actionId } = contextData;

		const [prefix, ...params] = actionId.split('_');

		try {
			switch (prefix) {
				case 'create-reminder': {
					return await this.processCreateAction(context);
				}
				case 'view-completed-tasks': {
					return await this.processViewCompletedTasksAction(context);
				}
				case 'help-command': {
					return await this.processHelpCommandAction(context);
				}
				case 'mark-as-completed-in-modal': {
					return await this.processMarkAsCompletedInModalAction(
						context,
						params,
					);
				}
				case 'mark-as-completed-in-msg': {
					return await this.processMarkAsCompletedInMsgAction(
						context,
						params,
					);
				}
				case 'delete-in-modal': {
					return await this.processDeleteInModalAction(
						context,
						params,
					);
				}
				case 'delete-in-msg': {
					return await this.processDeleteInMsgAction(context, params);
				}
				case 'delete-all-past-reminders': {
					return await this.processBulkDeleteRemindersAction(
						context,
						params,
						'past',
					);
				}
				case 'delete-all-completed-reminders': {
					return await this.processBulkDeleteRemindersAction(
						context,
						params,
						'completed',
					);
				}
				case 'view-all-reminders': {
					return await this.processViewAllRemindersAction(
						context,
						params,
					);
				}
				case 'snooze-reminder-in-msg': {
					return await this.processSnoozeReminderInMsgAction(
						context,
						params,
					);
				}
				case 'snooze-reminder-in-modal': {
					return await this.processSnoozeReminderInModalAction(
						context,
						params,
					);
				}
				case 'hide-msg': {
					return await this.processHideMsgAction(context);
				}
				case 'create-reminder-recipient-type-change': {
					return await this.processCreateReminderRecipientTypeChangeAction(
						context,
						params,
					);
				}
				case 'create-reminder-more-options': {
					return await this.processCreateReminderMoreOptionsAction(
						context,
						params,
					);
				}
				case 'linked-msg-reminder-change-duration-option': {
					return await this.processLinkedMsgReminderChangeDurationOptionAction(
						context,
						params,
					);
				}
				case 'configure-your-preferences': {
					return await this.processConfigurePreferencesAction(
						context,
					);
				}
				case 'edit-reminder': {
					return await this.processEditReminderAction(
						context,
						params,
					);
				}
				case 'backup-now': {
					return await this.processBackupNowAction(context);
				}
			}
		} catch (error) {
			this.app.getLogger().error(error);
		}

		return context.getInteractionResponder().successResponse();
	}

	private async processBackupNowAction(
		context: UIKitBlockInteractionContext,
	): Promise<IUIKitResponse> {
		const {
			user,
			user: { id: userId },
			room,
		} = context.getInteractionData();
		if (!user || !room) {
			throw new Error('Invalid context');
		}

		const language = await getUserPreferredLanguage(
			this.app,
			this.read.getPersistenceReader(),
			userId,
		);

		await this.modify.getScheduler().scheduleOnce({
			id: JobId.BACKUP_JOB,
			when: new Date(),
			data: {
				manualBackup: true,
				triggerId: uuid(),
			} as IBackupJobContext,
		});

		await sendRoomNotification(
			this.app,
			this.read,
			this.modify,
			room,
			t('backup_initiated_message', language),
		);

		return context.getInteractionResponder().successResponse();
	}

	private async processEditReminderAction(
		context: UIKitBlockInteractionContext,
		params: string[],
	): Promise<IUIKitResponse> {
		const [viewId, reminderId] = params;

		if (!viewId || !reminderId) {
			throw new Error(`Invalid params: ${params}`);
		}

		this.app
			.getLogger()
			.debug(`Processing edit reminder action: ${viewId} ${reminderId}`);

		const reminder = await Reminder.findOne(
			this.read.getPersistenceReader(),
			{
				id: reminderId,
			},
		);
		if (!reminder) {
			throw new Error(`Reminder not found: ${reminderId}`);
		}

		const {
			user: { id: userId, utcOffset },
		} = context.getInteractionData();

		const userPreference = await getUserPreference(
			this.app,
			this.read.getPersistenceReader(),
			userId,
		);

		const editReminderModal = await EditReminderModal({
			modify: this.modify,
			read: this.read,
			reminder,
			app: this.app,
			userPreference,
			userUTCOffset: utcOffset,
			viewId,
			persistence: this.persistence,
		});

		return context
			.getInteractionResponder()
			.updateModalViewResponse(editReminderModal);
	}

	private async processConfigurePreferencesAction(
		context: UIKitBlockInteractionContext,
	): Promise<IUIKitResponse> {
		const { user } = context.getInteractionData();

		const existingPreference = await getUserPreference(
			this.app,
			this.read.getPersistenceReader(),
			user.id,
		);

		const setLanguageModal = setUserPreferenceLanguageModal({
			modify: this.modify,
			existingPreference: existingPreference,
		});

		return context
			.getInteractionResponder()
			.openModalViewResponse(setLanguageModal);
	}

	private async processLinkedMsgReminderChangeDurationOptionAction(
		context: UIKitBlockInteractionContext,
		params: string[],
	): Promise<IUIKitResponse> {
		const [viewId] = params;
		const { value, user: { id: userId } = { id: '' } } =
			context.getInteractionData();
		if (!value) {
			throw new Error(
				'No value provided while trying to change duration option',
			);
		}

		const userPreference = await getUserPreference(
			this.app,
			this.read.getPersistenceReader(),
			userId,
		);

		const modal = await msgReminderCreationModal({
			app: this.app,
			read: this.read,
			persistence: this.persistence,
			modify: this.modify,
			currentDuration: value as Durations,
			existingViewId: viewId,
			userPreference,
		});
		return context.getInteractionResponder().updateModalViewResponse(modal);
	}

	private async processCreateReminderMoreOptionsAction(
		context: UIKitBlockInteractionContext,
		params: string[],
	): Promise<IUIKitResponse> {
		const [viewId, existingUserUtcOffset] = params;

		const { user: { id: userId } = { id: '' } } =
			context.getInteractionData();

		const userPreference = await getUserPreference(
			this.app,
			this.read.getPersistenceReader(),
			userId,
		);

		const modal = await createTaskCreationModal({
			existingViewId: viewId,
			recipientType: ReminderRecipientsType.ME,
			modify: this.modify,
			read: this.read,
			persistence: this.persistence,
			existingUserUtcOffset: Number(existingUserUtcOffset),
			moreOptionsVisible: true,
			userPreference,
		});

		return context.getInteractionResponder().updateModalViewResponse(modal);
	}

	private async processCreateReminderRecipientTypeChangeAction(
		context: UIKitBlockInteractionContext,
		params: string[],
	): Promise<IUIKitResponse> {
		const { value, user: { id: userId } = { id: '' } } =
			context.getInteractionData();
		if (!value) {
			throw new Error(
				'No value provided for reminder recipient type change',
			);
		}

		const userPreference = await getUserPreference(
			this.app,
			this.read.getPersistenceReader(),
			userId,
		);
		const [viewId, existingUserUtcOffset] = params;

		const modal = await createTaskCreationModal({
			existingViewId: viewId,
			recipientType: value as ReminderRecipientsType,
			modify: this.modify,
			read: this.read,
			persistence: this.persistence,
			existingUserUtcOffset: Number(existingUserUtcOffset),
			moreOptionsVisible: true,
			userPreference,
		});

		return context.getInteractionResponder().updateModalViewResponse(modal);
	}

	private async processHideMsgAction(
		context: UIKitBlockInteractionContext,
	): Promise<IUIKitResponse> {
		const {
			message: { id: messageId } = { id: null },
			user: { id: userId } = { id: '' },
		} = context.getInteractionData();
		if (!messageId) {
			throw new Error('Message id is not defined');
		}

		const appUser = await this.read
			.getUserReader()
			.getAppUser(this.app.getID());
		if (!appUser) {
			throw new Error('Error! Unable to get the app user');
		}

		const language = await getUserPreferredLanguage(
			this.app,
			this.read.getPersistenceReader(),
			userId,
		);

		const block = this.modify.getCreator().getBlockBuilder();
		block.addContextBlock({
			elements: [
				block.newMarkdownTextObject(
					`__${t('message_is_hidden', language)}__`,
				),
			],
		});

		await updateRoomMessageAfterRemovingPreviousContent(
			this.modify,
			messageId,
			appUser,
			{
				blocks: block,
				text: ` `,
			},
			true,
		);

		return context.getInteractionResponder().successResponse();
	}

	private async processSnoozeReminderInModalAction(
		context: UIKitBlockInteractionContext,
		params: string[],
	): Promise<IUIKitResponse> {
		const [viewId, reminderId, showCompleted] = params;

		const { user: { id: userId } = { id: '' } } =
			context.getInteractionData();

		const userPreference = await getUserPreference(
			this.app,
			this.read.getPersistenceReader(),
			userId,
		);
		const { language } = userPreference;

		const reminder = await Reminder.findOne(
			this.read.getPersistenceReader(),
			{ id: reminderId },
		);
		if (!reminder) {
			return context.getInteractionResponder().openModalViewResponse(
				dialogModal({
					title: t('something_went_wrong', language),
					text: t('error_unable_to_find_reminder', language),
					modify: this.modify,
					language,
				}),
			);
		}

		const {
			value,
			user: { utcOffset, username: currentUsername },
		} = context.getInteractionData();
		if (!value) {
			throw new Error('Value is not defined');
		}

		if (value === Durations.CUSTOM) {
			const modal = await CustomSnoozeModal({
				modify: this.modify,
				viewId,
				userPreference,
				utcOffset,
				persistence: this.persistence,
				reminderId: reminder.id,
				snoozedFrom: 'modal',
			});
			return context
				.getInteractionResponder()
				.updateModalViewResponse(modal);
		}

		const {
			nextSnoozeDate: nextDueDate,
			nextSnoozeMsg: nextDueDateMsgString,
		} = getNextSnoozedDateAndMsg(
			value as Durations,
			utcOffset,
			userPreference,
		);

		const { errorModal, updatedReminder } =
			await this._snoozeReminderHelper(
				context,
				reminder,
				nextDueDate,
				language,
			);
		if (errorModal) {
			return errorModal;
		}
		if (!updatedReminder) {
			return context.getInteractionResponder().openModalViewResponse(
				dialogModal({
					title: t('something_went_wrong', language),
					text: t('error_unable_to_find_reminder', language),
					modify: this.modify,
					language,
				}),
			);
		}

		await postSnoozeReminder(
			this.read,
			this.app,
			this.modify,
			language,
			updatedReminder,
			nextDueDateMsgString,
			currentUsername,
		);

		const modal = await createReminderListModal({
			app: this.app,
			modify: this.modify,
			read: this.read,
			user: context.getInteractionData().user,
			showCompleted: showCompleted === '1',
			existingViewId: viewId,
			userPreference,
			logger: this.app.getLogger(),
			persistence: this.persistence,
		});
		return context.getInteractionResponder().updateModalViewResponse(modal);
	}

	private async processSnoozeReminderInMsgAction(
		context: UIKitBlockInteractionContext,
		params: string[],
	): Promise<IUIKitResponse> {
		const [reminderId] = params;

		const { user: { id: userId } = { id: '' } } =
			context.getInteractionData();

		const userPreference = await getUserPreference(
			this.app,
			this.read.getPersistenceReader(),
			userId,
		);

		const { language } = userPreference;

		const reminder = await Reminder.findOne(
			this.read.getPersistenceReader(),
			{ id: reminderId },
		);
		if (!reminder) {
			return context.getInteractionResponder().openModalViewResponse(
				dialogModal({
					title: t('something_went_wrong', language),
					text: t('error_unable_to_find_reminder', language),
					modify: this.modify,
					language,
				}),
			);
		}

		const {
			value,
			user: { utcOffset, username: currentUsername },
		} = context.getInteractionData();
		if (!value) {
			throw new Error('Value is not defined');
		}

		if (value === Durations.CUSTOM) {
			const modal = await CustomSnoozeModal({
				modify: this.modify,
				userPreference,
				utcOffset,
				persistence: this.persistence,
				reminderId: reminder.id,
				snoozedFrom: 'message',
			});
			return context
				.getInteractionResponder()
				.openModalViewResponse(modal);
		}

		const {
			nextSnoozeDate: nextDueDate,
			nextSnoozeMsg: nextDueDateMsgString,
		} = getNextSnoozedDateAndMsg(
			value as Durations,
			utcOffset,
			userPreference,
		);

		const { errorModal, updatedReminder } =
			await this._snoozeReminderHelper(
				context,
				reminder,
				nextDueDate,
				language,
			);
		if (errorModal) {
			return errorModal;
		}
		if (!updatedReminder) {
			return context.getInteractionResponder().openModalViewResponse(
				dialogModal({
					title: t('something_went_wrong', language),
					text: t('error_unable_to_find_reminder', language),
					modify: this.modify,
					language,
				}),
			);
		}

		await postSnoozeReminder(
			this.read,
			this.app,
			this.modify,
			language,
			updatedReminder,
			nextDueDateMsgString,
			currentUsername,
		);

		return context.getInteractionResponder().successResponse();
	}

	private async processViewAllRemindersAction(
		context: UIKitBlockInteractionContext,
		params: string[],
	): Promise<IUIKitResponse> {
		const [viewId] = params;

		const { user: { id: userId } = { id: '' } } =
			context.getInteractionData();

		const userPreference = await getUserPreference(
			this.app,
			this.read.getPersistenceReader(),
			userId,
		);

		const modal = await createReminderListModal({
			app: this.app,
			modify: this.modify,
			read: this.read,
			user: context.getInteractionData().user,
			showCompleted: false,
			...(viewId && { existingViewId: viewId }),
			userPreference,
			logger: this.app.getLogger(),
			persistence: this.persistence,
		});
		if (viewId) {
			return context
				.getInteractionResponder()
				.updateModalViewResponse(modal);
		} else {
			return context
				.getInteractionResponder()
				.openModalViewResponse(modal);
		}
	}

	private async processBulkDeleteRemindersAction(
		context: UIKitBlockInteractionContext,
		params: string[],
		remindersType: 'completed' | 'past',
	): Promise<IUIKitResponse> {
		const [viewId] = params;

		const { user: { id: userId } = { id: '' } } =
			context.getInteractionData();

		const language = await getUserPreferredLanguage(
			this.app,
			this.read.getPersistenceReader(),
			userId,
		);

		const { value } = context.getInteractionData();
		if (!value) {
			const errorModal = dialogModal({
				title: t('something_went_wrong', language),
				text: t('error_unable_to_find_reminder', language),
				modify: this.modify,
				language,
			});
			return context
				.getInteractionResponder()
				.openModalViewResponse(errorModal);
		}

		const confirmationModal = await bulkDeleteConfirmationModal({
			modify: this.modify,
			remindersType,
			persistence: this.persistence,
			reminderIds: value.split(','),
			viewId,
			language,
		});

		return context
			.getInteractionResponder()
			.updateModalViewResponse(confirmationModal);
	}

	private async processDeleteInMsgAction(
		context: UIKitBlockInteractionContext,
		params: string[],
	): Promise<IUIKitResponse> {
		const [reminderId] = params;

		const { user: { id: userId } = { id: '' } } =
			context.getInteractionData();

		const language = await getUserPreferredLanguage(
			this.app,
			this.read.getPersistenceReader(),
			userId,
		);

		const { errorModal } = await this._deleteReminderHelper(
			context,
			reminderId,
			language,
		);
		if (errorModal) {
			return errorModal;
		}

		const successModal = dialogModal({
			title: t('success', language),
			text: t('reminder_delete_success', language),
			modify: this.modify,
			language,
		});

		return context
			.getInteractionResponder()
			.openModalViewResponse(successModal);
	}

	private async processDeleteInModalAction(
		context: UIKitBlockInteractionContext,
		params: string[],
	): Promise<IUIKitResponse> {
		const [viewId, reminderId, showCompleted] = params;

		const { user: { id: userId } = { id: '' } } =
			context.getInteractionData();

		const userPreference = await getUserPreference(
			this.app,
			this.read.getPersistenceReader(),
			userId,
		);
		const { language } = userPreference;

		const { errorModal } = await this._deleteReminderHelper(
			context,
			reminderId,
			language,
		);
		if (errorModal) {
			return errorModal;
		}

		const modal = await createReminderListModal({
			app: this.app,
			modify: this.modify,
			read: this.read,
			user: context.getInteractionData().user,
			showCompleted: showCompleted === '1',
			existingViewId: viewId,
			userPreference,
			logger: this.app.getLogger(),
			persistence: this.persistence,
		});
		return context.getInteractionResponder().updateModalViewResponse(modal);
	}

	private async processMarkAsCompletedInMsgAction(
		context: UIKitBlockInteractionContext,
		params: string[],
	): Promise<IUIKitResponse> {
		const [reminderId] = params;

		const { user: { id: userId } = { id: '' } } =
			context.getInteractionData();

		const language = await getUserPreferredLanguage(
			this.app,
			this.read.getPersistenceReader(),
			userId,
		);

		const { errorModal } = await this._markReminderAsCompletedHelper(
			context,
			reminderId,
			language,
		);

		return (
			errorModal || context.getInteractionResponder().successResponse()
		);
	}

	private async processMarkAsCompletedInModalAction(
		context: UIKitBlockInteractionContext,
		params: string[],
	): Promise<IUIKitResponse> {
		const [viewId, reminderId, showCompleted] = params;

		const { user: { id: userId } = { id: '' } } =
			context.getInteractionData();

		const userPreference = await getUserPreference(
			this.app,
			this.read.getPersistenceReader(),
			userId,
		);
		const { language } = userPreference;

		const { errorModal } = await this._markReminderAsCompletedHelper(
			context,
			reminderId,
			language,
		);
		if (errorModal) {
			return errorModal;
		}

		const modal = await createReminderListModal({
			app: this.app,
			modify: this.modify,
			read: this.read,
			user: context.getInteractionData().user,
			showCompleted: showCompleted === '1',
			existingViewId: viewId,
			userPreference,
			logger: this.app.getLogger(),
			persistence: this.persistence,
		});
		return context.getInteractionResponder().updateModalViewResponse(modal);
	}

	private async processViewCompletedTasksAction(
		context: UIKitBlockInteractionContext,
	): Promise<IUIKitResponse> {
		const { user: { id: userId } = { id: '' }, value } =
			context.getInteractionData();
		if (!value) {
			throw new Error(
				'Error! Unable to get the previous modal viewId while trying to show completed tasks',
			);
		}

		const userPreference = await getUserPreference(
			this.app,
			this.read.getPersistenceReader(),
			userId,
		);

		const modal = await createReminderListModal({
			app: this.app,
			modify: this.modify,
			read: this.read,
			user: context.getInteractionData().user,
			showCompleted: true,
			existingViewId: value,
			userPreference,
			logger: this.app.getLogger(),
			persistence: this.persistence,
		});

		return context.getInteractionResponder().updateModalViewResponse(modal);
	}

	private async processCreateAction(context: UIKitBlockInteractionContext) {
		const { room, user: { id: userId } = { id: '' } } =
			context.getInteractionData();
		if (!room) {
			throw new Error('Error! Unable to get the room');
		}

		const userPreference = await getUserPreference(
			this.app,
			this.read.getPersistenceReader(),
			userId,
		);

		const modal = await createTaskCreationModal({
			modify: this.modify,
			read: this.read,
			persistence: this.persistence,
			roomId: room.id,
			userId: userId,
			userPreference,
		});

		return context.getInteractionResponder().openModalViewResponse(modal);
	}

	private async processHelpCommandAction(
		context: UIKitBlockInteractionContext,
	) {
		const {
			room,
			user: { id: userId } = { id: '' },
			user,
		} = context.getInteractionData();
		if (!room) {
			throw new Error('Error! Unable to get the room');
		}

		const userPreference = await getUserPreference(
			this.app,
			this.read.getPersistenceReader(),
			userId,
		);

		await Commands.processHelpCommand({
			app: this.app,
			room,
			user,
			language: userPreference.language,
			modify: this.modify,
			read: this.read,
		});

		return context.getInteractionResponder().successResponse();
	}

	private async _snoozeReminderHelper(
		context: UIKitBlockInteractionContext,
		reminder: IReminder,
		nextDueDate: Date,
		language: Language,
	): Promise<{ errorModal?: IUIKitResponse; updatedReminder?: IReminder }> {
		const { errorI18n } = snoozeReminderPreCheck(reminder);
		if (errorI18n) {
			return {
				errorModal: context
					.getInteractionResponder()
					.openModalViewResponse(
						dialogModal({
							title: t('error', language),
							text: t(errorI18n, language),
							modify: this.modify,
							language,
						}),
					),
			};
		}

		const updatedReminder = await snoozeReminder(
			this.app,
			this.modify.getScheduler(),
			this.persistence,
			reminder,
			nextDueDate,
		);

		return { updatedReminder };
	}

	private async _markReminderAsCompletedHelper(
		context: UIKitBlockInteractionContext,
		reminderId: string,
		language: Language,
	): Promise<{ errorModal?: IUIKitResponse }> {
		const reminder = await Reminder.findOne(
			this.read.getPersistenceReader(),
			{ id: reminderId },
		);
		if (!reminder) {
			const errorModal = dialogModal({
				title: t('something_went_wrong', language),
				text: t('error_unable_to_find_reminder', language),
				modify: this.modify,
				language,
			});
			return {
				errorModal: context
					.getInteractionResponder()
					.openModalViewResponse(errorModal),
			};
		}

		const {
			user: { username: currentUsername },
		} = context.getInteractionData();

		const { messageId, linkedMessage, description } = reminder;

		await Reminder.markReminderAsComplete(
			this.read,
			this.persistence,
			reminder,
		);

		try {
			if (!messageId) {
				throw new Error(
					`Error! Unable to get the messageId for reminder with id ${reminderId}. Perhaps the reminder was not yet sent to the room?`,
				);
			}
			const appUser = await this.read
				.getUserReader()
				.getAppUser(this.app.getID());
			if (!appUser) {
				throw new Error('Error! Unable to get the app user');
			}

			const blocks = this.modify.getCreator().getBlockBuilder();
			if (linkedMessage) {
				try {
					let reminderCompletedMessage = t(
						'reminder_marked_as_completed',
						language,
					);
					const {
						url,
						msgAdditionalInfoPreview,
						metadata: { fromRoom, fromUser } = {},
						id: linkedMessageId,
					} = linkedMessage;

					// This reminder has been snoozed! I'll remind you about this message from @Bunny Smarty in #general (with note "test note") as complete.
					if (msgAdditionalInfoPreview || !fromRoom || !fromUser) {
						/* deprecated */
						reminderCompletedMessage = `Ok, I've marked the reminder about [this message](${url}) ${msgAdditionalInfoPreview} as complete`;
					} else {
						reminderCompletedMessage = t(
							description
								? 'reminder_completed_for_message_with_note'
								: 'reminder_completed_for_message',
							language,
							{
								messageUrl: url,
								userName: resolveTranslatedUserNameInfo(
									fromUser,
									currentUsername,
									language,
								),
								roomName: resolveTranslatedRoomName(
									fromRoom,
									fromRoom.type === 'unknown'
										? ''
										: fromRoom.url,
									language,
								),
								...(description && { note: description }),
							},
						);
					}

					blocks.addSectionBlock({
						text: blocks.newMarkdownTextObject(
							reminderCompletedMessage,
						),
					});

					// add message preview in-case message is from a Direct Message room as bot isn't part of DM room,
					// so it won't be able to render message preview
					if (fromRoom && fromRoom.type === RoomType.DIRECT_MESSAGE) {
						await addLinkedMessagePreviewBlock(
							blocks,
							this.app.getLogger(),
							this.read,
							linkedMessageId,
						);
					}
				} catch (e) {
					this.app
						.getLogger()
						.error(
							`Something went wrong while trying to resolve the additional info for reminder with id ${reminderId}`,
							e,
						);
				}
			} else {
				const reminderCompletedMessage = t(
					'reminder_completed_with_description',
					language,
					{
						description,
					},
				);

				blocks.addSectionBlock({
					text: blocks.newMarkdownTextObject(
						reminderCompletedMessage,
					),
				});
			}

			blocks.addActionsBlock({
				elements: [
					blocks.newButtonElement({
						text: blocks.newPlainTextObject(
							t('view_all_reminders', language),
						),
						actionId: 'view-all-reminders',
					}),
					blocks.newButtonElement({
						text: blocks.newPlainTextObject(
							t('hide_this_message', language),
						),
						actionId: 'hide-msg',
					}),
				],
			});

			await updateRoomMessageAfterRemovingPreviousContent(
				this.modify,
				messageId,
				appUser,
				{
					blocks,
				},
			);
		} catch (error) {
			// TODO: Right now we're failing silently here, but we should probably do something here
			// Also note, If a user marks a reminder as complete, but the message is not sent to the room yet(i.e. from upcoming reminders in list), then also this error will be thrown.
			this.app.getLogger().error(error);
		}

		return {};
	}

	private async _deleteReminderHelper(
		context: UIKitBlockInteractionContext,
		reminderId: string,
		language: Language,
	): Promise<{ errorModal?: IUIKitResponse }> {
		const reminder = await Reminder.findOne(
			this.read.getPersistenceReader(),
			{ id: reminderId },
		);
		if (!reminder) {
			const errorModal = dialogModal({
				title: t('something_went_wrong', language),
				text: t('error_unable_to_find_reminder', language),
				modify: this.modify,
				language,
			});
			return {
				errorModal: context
					.getInteractionResponder()
					.openModalViewResponse(errorModal),
			};
		}

		await Reminder.clearByQuery(this.persistence, { id: reminderId });

		if (
			reminder.audience?.type === 'room' &&
			reminder.status === 'active'
		) {
			// incase the reminder has channel as audience, then we need to send a message to the channel saying that the reminder has been deleted
			const { user: reminderDeletedBy } = context.getInteractionData();

			const { roomId, createdBy } = reminder;

			const reminderCreator =
				(await this.read.getUserReader().getById(createdBy))
					?.username || t('unknown_user', language);

			const room = await this.read.getRoomReader().getById(roomId);
			if (room) {
				const deletedReminderMessage = t(
					'channel_reminder_deleted_message',
					language,
					{
						description: reminder.description,
						reminderCreator: `@${reminderCreator}`,
					},
				);

				await sendRoomMessage(
					this.modify,
					reminderDeletedBy,
					room,
					deletedReminderMessage,
				);
			} else {
				this.app
					.getLogger()
					.error(
						`Unable to find room with id ${roomId} for reminder with id ${reminderId} to send reminder deleted message`,
					);
				return {};
			}
		}

		if (isRecurringReminder(reminder.frequency)) {
			return {};
		}

		try {
			if (!reminder.messageId) {
				if (reminder.audience) {
					// this is either a group or a user reminder, so we can't delete the message
					return {};
				}
				throw new Error(
					`Error! Unable to get the messageId for reminder with id ${reminderId} while trying to perform delete operation. Perhaps the reminder was not yet sent to the room?`,
				);
			}
			const appUser = await this.read
				.getUserReader()
				.getAppUser(this.app.getID());
			if (!appUser) {
				throw new Error('Error! Unable to get the app user');
			}

			await updateRoomMessageAfterRemovingPreviousContent(
				this.modify,
				reminder.messageId,
				appUser,
				{
					text: '',
				},
				true,
			);
		} catch (error) {
			// TODO: Right now we're failing silently here, but we should probably do something here
			// Also note, If a user marks a reminder as complete, but the message is not sent to the room yet(i.e. from upcoming reminders in list), then also this error will be thrown.
			this.app.getLogger().error(error);
		}

		return {};
	}
}
