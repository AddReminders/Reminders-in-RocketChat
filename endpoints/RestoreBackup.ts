import {
	HttpStatusCode,
	IHttp,
	IModify,
	IPersistence,
	IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
	ApiEndpoint,
	IApiEndpointInfo,
	IApiRequest,
	IApiResponse,
} from '@rocket.chat/apps-engine/definition/api';
import { IBackup } from '../definitions/IBackup';
import { IReminder } from '../definitions/IReminder';
import { IRestartJobContext } from '../definitions/Jobs';
import { JobId } from '../enums/Jobs';
import { addSecondsToDate } from '../lib/Dates';
import { Reminder, UserPreference } from '../lib/Persistence/Models';
import { decryptBackupData } from '../lib/BackupEncryption';
import { getBackupUser } from '../lib/utils';
import { defineBackupRoom } from '../lib/Room/BackupRoom';
import { sendRoomMessage } from '../lib/Message';
import { Links } from '../enums/Links';
import { RemindApp } from '../RemindApp';

export class RestoreBackup extends ApiEndpoint {
	public path = 'restoreBackup';

	constructor(public app: RemindApp) {
		super(app);
	}

	public async post(
		request: IApiRequest,
		endpoint: IApiEndpointInfo,
		read: IRead,
		modify: IModify,
		http: IHttp,
		persis: IPersistence,
	): Promise<IApiResponse> {
		// expected format of backupUrl: https://open.rocket.chat/group/channel?msg=123456789
		const { backupFileUrl } = request.content;

		if (!backupFileUrl) {
			return {
				status: HttpStatusCode.BAD_REQUEST,
				content: {
					error: 'Missing backupFileUrl. It should be a URL to a file on the RocketChat server.',
				},
			};
		}

		// validate if backupFileUrl has ?msg=
		if (!backupFileUrl.includes('?msg=')) {
			return {
				status: HttpStatusCode.BAD_REQUEST,
				content: {
					error: 'Invalid backupFileUrl. It should be a URL to a file on the RocketChat server. It should contain the ?msg= parameter. Example: https://open.rocket.chat/group/channel?msg=123456789',
				},
			};
		}

		// extract the msgId from the backupFileUrl
		const msgId: string = backupFileUrl.split('msg=')[1];

		const message = await read.getMessageReader().getById(msgId);
		if (!message) {
			return {
				status: HttpStatusCode.BAD_REQUEST,
				content: {
					error: `Invalid backupFileUrl. No message found with id: ${msgId}`,
				},
			};
		}

		const { file } = message;
		if (!file) {
			return {
				status: HttpStatusCode.BAD_REQUEST,
				content: {
					error: `Invalid backupFileUrl. No file found for message with id: ${msgId}.`,
				},
			};
		}

		const { _id: fileId } = file;

		const upload = await read.getUploadReader().getById(fileId);
		if (!upload) {
			return {
				status: HttpStatusCode.INTERNAL_SERVER_ERROR,
				content: {
					error: 'Error reading uploaded file. ',
				},
			};
		}

		const { type } = upload;

		if (!['application/json', 'text/plain'].includes(type)) {
			return {
				status: HttpStatusCode.BAD_REQUEST,
				content: {
					error: `Invalid backup file type. It should be a JSON or plain text file. It is: ${type}`,
				},
			};
		}

		const buffer = await read.getUploadReader().getBufferById(fileId);
		if (!buffer) {
			return {
				status: HttpStatusCode.INTERNAL_SERVER_ERROR,
				content: {
					error: 'Error reading uploaded file. File buffer is empty.',
				},
			};
		}

		let backup: IBackup;
		try {
			if (type === 'text/plain') {
				// encrypted backup file
				backup = decryptBackupData(buffer);
			} else {
				// unencrypted file
				backup = JSON.parse(buffer.toString()) as IBackup;
			}

			// convert date string to Date objects
			backup.reminders.forEach((reminder: IReminder) => {
				reminder.createdAt = new Date(reminder.createdAt);
				reminder.dueDate = new Date(reminder.dueDate);
				reminder.completedAt &&
					(reminder.completedAt = new Date(reminder.completedAt));
			});
		} catch (e) {
			return {
				status: HttpStatusCode.INTERNAL_SERVER_ERROR,
				content: {
					error:
						'Something went wrong while parsing the backup file. Error: ' +
						e.message,
				},
			};
		}

		// validate backup
		if (!backup.reminders || !backup.userPreferences) {
			return {
				status: HttpStatusCode.BAD_REQUEST,
				content: {
					error: 'Invalid backup file. It should contain the reminders and userPreferences properties.',
				},
			};
		}

		// verify if the server does not have any active reminders
		const anActiveReminder = await Reminder.findOne(
			read.getPersistenceReader(),
			{
				status: 'active',
			},
		);
		if (anActiveReminder) {
			return {
				status: HttpStatusCode.BAD_REQUEST,
				content: {
					error: 'There are active reminders on this server. A backup can only be restored if there are no active reminders. Please un-install the Reminder Bot app and install it again before restoring the backup file.',
				},
			};
		}

		// Step 1) delete all existing data
		this.app.getLogger().info('Deleting existing data...');
		await Promise.all([
			Reminder.clearAll(persis),
			UserPreference.clearAll(persis),
		]);
		this.app.getLogger().info('Deleted existing data.');

		// Step 2) restore backup
		this.app.getLogger().info('Restoring backup...');

		const { reminders, userPreferences } = backup;

		// restore user preferences
		this.app
			.getLogger()
			.debug(`Restoring user preferences. Start time: ${new Date()}`);
		const insertedUserPreferenceIds = await Promise.all(
			userPreferences.map(async (u) =>
				UserPreference.insertOne(persis, u),
			),
		);
		this.app
			.getLogger()
			.debug(
				`Inserted ${
					insertedUserPreferenceIds.length
				} user preferences. End time: ${new Date()}`,
			);

		// finally restore reminders
		this.app
			.getLogger()
			.debug(`Restoring reminders. Start time: ${new Date()}`);
		const insertedReminderIds = await Promise.all(
			reminders.map(async (r) => Reminder.insertOne(persis, r)),
		);
		this.app
			.getLogger()
			.debug(
				`Inserted ${
					insertedReminderIds.length
				} reminders. End time: ${new Date()}`,
			);

		this.app.getLogger().info('Restored backup in database.');

		// Step 3) restart jobs
		this.app.getLogger().info(`Attempting to restart jobs now`);

		await modify.getScheduler().scheduleOnce({
			id: JobId.JOBS_RESTART_JOB,
			when: addSecondsToDate(new Date(), 10),
			data: {
				restartReminderJobs: true,
			} as IRestartJobContext,
		});

		this.app
			.getLogger()
			.info('Successfully scheduled restart job in 10 seconds.');

		await this.sendBackupInitiatedMessage(read, modify);

		return this.json({
			status: HttpStatusCode.OK,
			content: {
				success: true,
				msg: 'Backup restored successfully in database. Jobs will be restarted in 10 seconds.',
			},
		});
	}

	private async sendBackupInitiatedMessage(read: IRead, modify: IModify) {
		try {
			const backupUser = await getBackupUser(read, this.app.getLogger());
			if (!backupUser) {
				this.app
					.getLogger()
					.error(
						'Unable to create backup since backup user not found',
					);
				return;
			}

			const backupChannel = await defineBackupRoom(
				this.app,
				read,
				modify,
				[backupUser],
			);
			if (!backupChannel) {
				this.app
					.getLogger()
					.error(
						'Backup channel not found. Unable to create backup :(',
					);
				return;
			}

			await sendRoomMessage(
				modify,
				backupUser,
				backupChannel,
				`A backup restore has been initiated. Please wait for it to finish. Expected wait time: 1 minute. If you don't see any confirmation message in 1 minute, then please check the reminder bot logs (Administrator -> Apps -> Click "Reminder Bot" -> Logs) for any errors (specifically, the logs events with the tag "jobProcessor"). If you need help, please contact us at [here](${Links.ContactUsPageUrl})`,
			);
		} catch (e) {
			this.app
				.getLogger()
				.error('Error sending backup initiated message: ' + e.message);
			this.app.getLogger().error(e);
		}
	}
}
