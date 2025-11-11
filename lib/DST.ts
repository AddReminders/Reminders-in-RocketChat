import {
	IModify,
	IPersistence,
	IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { Reminder } from './Persistence/Models';
import { DSTMovement } from '../enums/DST';
import { RemindApp } from '../RemindApp';
import { ReminderJob } from '../jobs/ReminderJob';

class DSTClass {
	async applyDSTToReminders({
		app,
		modify,
		movement,
		persis,
		read,
	}: {
		app: RemindApp;
		modify: IModify;
		movement: DSTMovement;
		persis: IPersistence;
		read: IRead;
	}) {
		const activeReminders = await Reminder.findAll(
			read.getPersistenceReader(),
			{
				status: 'active',
			},
		);

		app.getLogger().debug({
			msg: 'Applying DST to reminders',
			totalReminders: activeReminders.length,
		});

		const promises = activeReminders.map(async (reminder) => {
			const { dueDate } = reminder;
			const newWhen = this.applyDSTToReminder({
				movement,
				dueDate,
			});

			reminder.dueDate = newWhen;

			// cancel the old job
			if (reminder.schedularJobId) {
				await modify.getScheduler().cancelJob(reminder.schedularJobId);
			}

			const jobId = await new ReminderJob(app).scheduleReminder(
				modify.getScheduler(),
				reminder.id,
				reminder.dueDate,
			);
			reminder.schedularJobId = jobId;

			return Reminder.insertOrUpdate(persis, reminder);
		});

		return Promise.all(promises);
	}

	// move date forward or backward by 1 hour
	private applyDSTToReminder({
		movement,
		dueDate,
	}: {
		movement: DSTMovement;
		dueDate: Date;
	}): Date {
		let dayChanged: 0 | 1 | -1 = 0;

		const newWhen = new Date(dueDate);
		if (movement === DSTMovement.FORWARD) {
			const currentHour = newWhen.getHours();
			// if the hour is 23, we need to move the date forward by 1 day
			if (currentHour === 23) {
				dayChanged = 1;
			}
			newWhen.setHours(newWhen.getHours() + 1);
		} else {
			const currentHour = newWhen.getHours();
			// if the hour is 0, we need to move the date backward by 1 day
			if (currentHour === 0) {
				dayChanged = -1;
			}
			newWhen.setHours(newWhen.getHours() - 1);
		}

		if (dayChanged !== 0) {
			newWhen.setDate(newWhen.getDate() + dayChanged);
		}

		return newWhen;
	}
}

/**
 * DST - Daylight Saving Time helper
 */
export const DST = new DSTClass();
