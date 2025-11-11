import { IJobContext } from '@rocket.chat/apps-engine/definition/scheduler';

export interface IJobWithTriggerId extends IJobContext {
	triggerId: string;
}

export interface IReminderJobContext extends IJobContext {
	reminderId: string;
}

export interface IRestartJobContext extends IJobContext {
	restartReminderJobs?: boolean;
}

export interface IDailyReminderJobContext extends IJobContext {
	userId: string;
}

export interface IBackupJobContext extends IJobWithTriggerId {
	manualBackup?: boolean;
}
