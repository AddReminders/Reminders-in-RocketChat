import {
	IPersistence,
	IModify,
	IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
	ButtonStyle,
	IUIKitResponse,
	UIKitViewSubmitInteractionContext,
} from '@rocket.chat/apps-engine/definition/uikit';
import { IUIKitModalViewParam } from '@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder';
import { IBulkDeleteConfirmActionData } from '../../../definitions/Persistence';
import { updateRoomMessageAfterRemovingPreviousContent } from '../../../lib/Message';
import {
	Reminder,
	ReminderListModalActionUiData,
} from '../../../lib/Persistence/Models';
import { Language, t } from '../../../lib/Translation/translation';
import { getUserPreferredLanguage } from '../../../lib/UserPreference';
import { RemindApp } from '../../../RemindApp';
import { dialogModal } from '../DialogModal';

export async function bulkDeleteConfirmationModal({
	modify,
	persistence,
	reminderIds,
	remindersType,
	viewId,
	language,
}: {
	viewId: string;
	persistence: IPersistence;
	modify: IModify;
	reminderIds: string[];
	remindersType: 'completed' | 'past';
	language: Language;
}): Promise<IUIKitModalViewParam> {
	await ReminderListModalActionUiData.insertOrUpdate(persistence, {
		currentAction: 'bulkDelete',
		viewId,
		data: {
			reminderIds,
			remindersType,
		} as IBulkDeleteConfirmActionData,
	});

	const block = modify.getCreator().getBlockBuilder();
	block.addSectionBlock({
		text: block.newMarkdownTextObject(
			t('bulk_delete_reminders_confirmation_message', language, {
				total: reminderIds.length,
				reminderType: t(remindersType, language),
			}),
		),
	});
	return {
		id: viewId,
		title: block.newPlainTextObject(t('delete_reminder', language)),
		submit: block.newButtonElement({
			text: block.newPlainTextObject(t('yes_delete_reminders', language)),
			style: ButtonStyle.DANGER,
		}),
		close: block.newButtonElement({
			text: block.newPlainTextObject(t('no_cancel', language)),
		}),
		blocks: block.getBlocks(),
	};
}

export const submitBulkDeleteConfirmationModal = async ({
	context,
	modify,
	read,
	persistence,
	app,
	uiData,
}: {
	app: RemindApp;
	context: UIKitViewSubmitInteractionContext;
	read: IRead;
	modify: IModify;
	persistence: IPersistence;
	uiData: IBulkDeleteConfirmActionData;
}): Promise<IUIKitResponse> => {
	const {
		view: { id: viewId },
		user: { id: userId } = { id: '' },
	} = context.getInteractionData();

	const language = await getUserPreferredLanguage(
		app,
		read.getPersistenceReader(),
		userId,
	);

	const { reminderIds, remindersType } = uiData;

	const appUser = await read.getUserReader().getAppUser(app.getID());
	if (!appUser) {
		throw new Error('Error! Unable to get the app user');
	}

	if (!reminderIds.length) {
		return context.getInteractionResponder().errorResponse();
	}

	try {
		app.getLogger().debug(
			`Deleting ${reminderIds.length} reminders of type ${remindersType}. Fetching reminders from persistence...`,
		);
		const allReminders = await Promise.all(
			reminderIds.map((id) =>
				Reminder.findOne(read.getPersistenceReader(), {
					id,
				}),
			),
		);

		app.getLogger().debug(
			`Fetching ${reminderIds.length} reminders of type ${remindersType} from persistence completed. Clearing reminders from persistence...`,
		);

		await Promise.all(
			allReminders.map((reminder) => {
				if (!reminder) {
					return;
				}

				const { id: reminderId } = reminder;

				return Reminder.clearByQuery(persistence, { id: reminderId });
			}),
		);

		app.getLogger().debug(
			`Clearing ${reminderIds.length} reminders of type ${remindersType} from persistence completed. Updating corresponding room messages...`,
		);

		await Promise.all(
			allReminders.map(async (reminder) => {
				if (!reminder || !reminder.messageId) {
					return;
				}

				try {
					await updateRoomMessageAfterRemovingPreviousContent(
						modify,
						reminder.messageId,
						appUser,
						{
							text: '',
						},
						true,
					);
				} catch (error) {
					app.getLogger().error(
						`Error while updating the message after removing the reminder with id: ${reminder.id}:`,
						error,
					);
				}
				return;
			}),
		);
		app.getLogger().debug(
			`Updating ${reminderIds.length} reminders of type ${remindersType} corresponding room messages completed.`,
		);
	} catch (error) {
		app.getLogger().error(
			`Error while deleting reminders of type ${remindersType}:`,
			error,
		);

		const errorModal = dialogModal({
			title: t('error', language),
			text: t('error_unable_to_perform_bulk_delete', language),
			modify,
			viewId,
			language,
		});

		return context
			.getInteractionResponder()
			.updateModalViewResponse(errorModal);
	}

	const confirmationModal = bulkDeleteOperationSuccessfulModal(
		modify,
		viewId,
		remindersType,
		language,
	);

	return context
		.getInteractionResponder()
		.updateModalViewResponse(confirmationModal);
};

const bulkDeleteOperationSuccessfulModal = (
	modify: IModify,
	viewId: string,
	remindersType: 'completed' | 'past',
	language: Language,
): IUIKitModalViewParam => {
	const block = modify.getCreator().getBlockBuilder();
	block.addSectionBlock({
		text: block.newMarkdownTextObject(
			t('delete_reminders_success_message', language, { remindersType }),
		),
	});

	block.addActionsBlock({
		elements: [
			block.newButtonElement({
				text: block.newPlainTextObject(
					t('view_all_reminders', language),
				),
				actionId: `view-all-reminders_${viewId}`,
			}),
		],
	});
	return {
		id: viewId,
		title: block.newPlainTextObject(t('delete_reminder', language)),
		close: block.newButtonElement({
			text: block.newPlainTextObject(t('okay_close', language)),
		}),
		blocks: block.getBlocks(),
	};
};
