import { IReminder } from './IReminder';
import { IPreference } from './Persistence';

export interface IBackup {
	reminders: IReminder[];
	userPreferences: IPreference[];
}
