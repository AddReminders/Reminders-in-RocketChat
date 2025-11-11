import {
	IRead,
	IModify,
	IHttp,
	IPersistence,
} from '@rocket.chat/apps-engine/definition/accessors';
import { IProcessor } from '@rocket.chat/apps-engine/definition/scheduler';
import { AppSetting } from '../config/Settings';
import { IBackup } from '../definitions/IBackup';
import { IBackupJobContext } from '../definitions/Jobs';
import { JobId } from '../enums/Jobs';
import { Links } from '../enums/Links';
import { encryptBackupData } from '../lib/BackupEncryption';
import { addHoursToDate } from '../lib/Dates';
import { sendRoomMessage } from '../lib/Message';
import {
	InternalJobsLastRun,
	Reminder,
	UserPreference,
} from '../lib/Persistence/Models';
import { defineBackupRoom } from '../lib/Room/BackupRoom';
import {
	getBackupUser,
	getFormattedTime,
	parseBackupInterval,
	uuid,
} from '../lib/utils';
import { RemindApp } from '../RemindApp';
import { scheduleAndLockJob, shouldExecuteJob } from './utils';

export class BackupJob {
	private jobId: JobId.BACKUP_JOB = JobId.BACKUP_JOB;
	constructor(private app: RemindApp) {}

	public getBackupJob(): IProcessor {
		const job: IProcessor = {
			id: this.jobId,
			processor: this.processor.bind(this),
		};
		return job;
	}

	private async processor(
		jobContext: IBackupJobContext,
		read: IRead,
		modify: IModify,
		http: IHttp,
		persis: IPersistence,
	) {
		const { triggerId, manualBackup } = jobContext;

		this.app.getLogger().debug('Attempting to create a backup', {
			manualBackup,
		});

		if (
			!manualBackup &&
			!(await shouldExecuteJob(
				read,
				this.jobId,
				triggerId,
				this.app.getLogger(),
			))
		) {
			return;
		}

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

			// I know this is gonna be a very expensive operation, but there's no other choice at the moment :(
			const [allRemindersData, allUserPreferenceData] = await Promise.all(
				[
					Reminder.findAll(read.getPersistenceReader(), {}),
					UserPreference.findAll(read.getPersistenceReader(), {}),
				],
			);

			if (
				allRemindersData.length === 0 &&
				allUserPreferenceData.length === 0
			) {
				this.app.getLogger().info('No data to backup. Skipping');
				await sendRoomMessage(
					modify,
					backupUser,
					backupChannel,
					'ℹ️ No Reminder Bot data found to backup, so skipping this time',
				);
				return;
			}

			const backupDataJSON: IBackup = {
				reminders: allRemindersData,
				userPreferences: allUserPreferenceData,
			};

			const { filename, content } = await this.resolveBackupFile(
				read,
				backupDataJSON,
			);

			const upload = await modify
				.getCreator()
				.getUploadCreator()
				.uploadBuffer(content, {
					filename,
					room: backupChannel,
					user: backupUser,
				});

			this.app
				.getLogger()
				.info(
					`Backup created: ${upload?.url} . Sending to backup summary message to backup channel`,
				);

			// also add some stats to the backup channel about the backup
			const backupStatsMsg = `**Reminder Bot's backup summary**\n\n- File name: \`${filename}\`\n- Total Reminders: ${allRemindersData.length}\n- Total User Preferences: ${allUserPreferenceData.length}\n\nNeed to restore this backup? Checkout our [restore guide](${Links.RestoreBackupGuideLink})\n\nWe recommend deleting older backups to save storage space. You may use "Purge Messages" option to delete multiple old backup files at once\n\n**Note:** This is only a backup of data related to the Reminder Bot in your Rocket.Chat server, not the data in your entire Rocket.Chat server.`;
			await sendRoomMessage(
				modify,
				backupUser,
				backupChannel,
				backupStatsMsg,
			);

			this.app.getLogger().info('Backup completed');
		} catch (e) {
			this.app.getLogger().error('Error creating a backup', e);
		}

		if (manualBackup) {
			this.app.getLogger().debug('Manual backup completed');
			return;
		}

		const backupJobTriggerId = uuid();

		this.app
			.getLogger()
			.debug(
				`Scheduling next backup job with triggerId: ${backupJobTriggerId}`,
			);

		const interval = parseBackupInterval(
			await read
				.getEnvironmentReader()
				.getSettings()
				.getValueById(AppSetting.BackupInterval),
		);

		await scheduleAndLockJob(
			modify,
			persis,
			this.jobId,
			addHoursToDate(new Date(), interval),
			{
				triggerId: backupJobTriggerId,
			},
		);

		this.app
			.getLogger()
			.debug(
				`Next backup job scheduled in ${interval} hours. Updating lastRunAt`,
			);

		await InternalJobsLastRun.updateLastRun(
			read.getPersistenceReader(),
			persis,
			this.jobId,
		);

		this.app
			.getLogger()
			.debug(
				`Successfully updated lastRunAt for backup job. Next backup job will be scheduled in ${interval} hours`,
			);
	}

	private async resolveBackupFile(
		read: IRead,
		backup: IBackup,
	): Promise<{ filename: string; content: Buffer }> {
		const { value: backupRequired } = (await read
			.getEnvironmentReader()
			.getSettings()
			.getById(AppSetting.BackupEncrypted)) || { value: true };

		const backupFileBase = `reminder-app-backup-${getFormattedTime(
			new Date(),
		)}`;

		if (!backupRequired) {
			return {
				content: Buffer.from(JSON.stringify(backup)),
				filename: `${backupFileBase}.json`,
			};
		}

		return {
			content: encryptBackupData(backup),
			filename: `${backupFileBase}.txt`,
		};
	}
}
