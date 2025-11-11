import {
	IHttp,
	IModify,
	IPersistence,
	IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
	IUIKitResponse,
	UIKitViewSubmitInteractionContext,
} from '@rocket.chat/apps-engine/definition/uikit';
import {
	IBulkDeleteConfirmActionData,
	ICustomSnoozeActionData,
	IEditReminderActionData,
} from '../definitions/Persistence';
import {
	CustomSnoozeModalUiData,
	ModalClickEventLock,
	ReminderListModalActionUiData,
} from '../lib/Persistence/Models';
import { RemindApp } from '../RemindApp';
import { CustomSnoozeModalViewIdPrefix } from '../ui/modals/CustomSnoozeModal/Modal';
import { submitCustomSnoozeModal } from '../ui/modals/CustomSnoozeModal/Submitter';
import { submitEditReminderModal } from '../ui/modals/EditReminderModal/Submitter';
import { MsgReminderCreateModalViewIdPrefix } from '../ui/modals/MsgReminderCreateModal/Modal';
import { submitMsgReminderCreateModal } from '../ui/modals/MsgReminderCreateModal/Submitter';
import { SetUserPreferenceModalViewIdPrefix } from '../ui/modals/SetUserPreferenceModal/Modal';
import { submitSetPreferencesModal } from '../ui/modals/SetUserPreferenceModal/Submitter';
import { ReminderCreateModalViewIdPrefix } from '../ui/modals/TaskCreateModal/Modal';
import { submitTaskCreateModal } from '../ui/modals/TaskCreateModal/Submitter';
import { submitBulkDeleteConfirmationModal } from '../ui/modals/TaskResultModal/BulkDeleteConfirmationModal';
import { ReminderListModalViewIdPrefix } from '../ui/modals/TaskResultModal/Modal';

export class ExecuteViewSubmitHandler {
	constructor(
		private readonly app: RemindApp,
		private readonly read: IRead,
		private readonly http: IHttp,
		private readonly modify: IModify,
		private readonly persistence: IPersistence,
	) {}

	public async run(context: UIKitViewSubmitInteractionContext) {
		const {
			view: { id: viewId },
		} = context.getInteractionData();
		// eslint-disable-next-line prefer-const
		let result: IUIKitResponse = { success: true };
		const formPrefix = viewId.split('-')[0];

		if (
			await ModalClickEventLock.findOne(
				this.read.getPersistenceReader(),
				{
					viewId,
				},
			)
		) {
			return context
				.getInteractionResponder()
				.viewErrorResponse({ viewId, errors: {} });
		}

		try {
			// acquire lock
			await ModalClickEventLock.insertOrUpdate(this.persistence, {
				viewId,
			});

			switch (formPrefix) {
				case ReminderCreateModalViewIdPrefix: {
					result = await submitTaskCreateModal({
						app: this.app,
						context,
						read: this.read,
						modify: this.modify,
						persistence: this.persistence,
					});
					break;
				}
				case ReminderListModalViewIdPrefix: {
					const uiData = await ReminderListModalActionUiData.findOne(
						this.read.getPersistenceReader(),
						{ viewId },
					);
					if (!uiData) {
						throw new Error(
							`uiData not found for viewId: ${viewId}. Something must have terribly gone wrong.`,
						);
					}

					switch (uiData.currentAction) {
						case 'customSnooze': {
							result = await submitCustomSnoozeModal({
								app: this.app,
								context,
								read: this.read,
								modify: this.modify,
								persistence: this.persistence,
								uiData: uiData.data as ICustomSnoozeActionData,
								openResultModalPostSubmit: true,
							});
							break;
						}
						case 'bulkDelete': {
							result = await submitBulkDeleteConfirmationModal({
								app: this.app,
								context,
								read: this.read,
								modify: this.modify,
								persistence: this.persistence,
								uiData: uiData.data as IBulkDeleteConfirmActionData,
							});
							break;
						}
						case 'editReminder': {
							result = await submitEditReminderModal({
								app: this.app,
								context,
								read: this.read,
								modify: this.modify,
								persistence: this.persistence,
								uiData: uiData.data as IEditReminderActionData,
							});
						}
					}

					break;
				}
				case CustomSnoozeModalViewIdPrefix: {
					const uiData = await CustomSnoozeModalUiData.findOne(
						this.read.getPersistenceReader(),
						{ viewId },
					);
					if (!uiData) {
						throw new Error(
							`uiData not found for viewId: ${viewId}. Something must have terribly gone wrong.`,
						);
					}

					result = await submitCustomSnoozeModal({
						app: this.app,
						context,
						read: this.read,
						modify: this.modify,
						persistence: this.persistence,
						uiData,
						openResultModalPostSubmit: false,
					});

					break;
				}
				case MsgReminderCreateModalViewIdPrefix: {
					result = await submitMsgReminderCreateModal({
						app: this.app,
						context,
						read: this.read,
						modify: this.modify,
						persistence: this.persistence,
					});
					break;
				}
				case SetUserPreferenceModalViewIdPrefix: {
					result = await submitSetPreferencesModal({
						app: this.app,
						context,
						read: this.read,
						modify: this.modify,
						persistence: this.persistence,
					});
					break;
				}
				default: {
					break;
				}
			}
		} finally {
			// release lock
			await ModalClickEventLock.clearByQuery(this.persistence, {
				viewId,
			});
		}

		// clear context only incase the user is navigating away from the modal (i.e. modal automatically closes post submit)
		if (result && result.success) {
			const formPrefix = viewId.split('-')[0];
			switch (formPrefix) {
				case CustomSnoozeModalViewIdPrefix: {
					await CustomSnoozeModalUiData.clearByQuery(
						this.persistence,
						{
							viewId,
						},
					);
					break;
				}
			}
		}

		return result;
	}
}
