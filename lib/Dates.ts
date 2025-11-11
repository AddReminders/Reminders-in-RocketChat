import {
	IOptionObject,
	TextObjectType,
} from '@rocket.chat/apps-engine/definition/uikit';
import { IPreference } from '../definitions/Persistence';
import { TimeZones } from '../enums/TimeZones';
import { RecurringReminderFrequencies } from '../enums/Ui';
import { Language } from './Translation/translation';

export const formatDateForMsg = (
	date: Date,
	monthFormat: 'short' | 'long',
	timezoneUtcString: string,
	language: Language,
): string => {
	return `${new Intl.DateTimeFormat(language, {
		day: 'numeric',
		timeZone: timezoneUtcString,
	}).format(date)} ${new Intl.DateTimeFormat(language, {
		month: monthFormat,
		timeZone: timezoneUtcString,
	}).format(date)}`;
};

export const formatTimeForMsg = (
	date: Date,
	timezoneUtcString: string,
	{
		language,
		showTimeIn24HourFormat,
	}: Pick<IPreference, 'language' | 'showTimeIn24HourFormat'>,
): string =>
	new Intl.DateTimeFormat(language, {
		hour: '2-digit',
		minute: '2-digit',
		timeZone: timezoneUtcString,
		...(showTimeIn24HourFormat
			? {
					hourCycle: 'h23',
					// eslint-disable-next-line no-mixed-spaces-and-tabs
			  }
			: { hourCycle: 'h12' }),
	} as unknown as Intl.DateTimeFormatOptions).format(date);

export const formatDateTimeForMsg = (
	date: Date,
	userTimezoneOffset = new Date().getTimezoneOffset(),
	userPreference: IPreference,
): string => {
	const { language } = userPreference;
	const timezoneUtcString = getTimezoneUtcString(userTimezoneOffset);
	return `${formatDateForMsg(
		date,
		'short',
		timezoneUtcString,
		language,
	)} ${formatTimeForMsg(date, timezoneUtcString, userPreference)}`;
};

export const getFormattedTimezoneForMsg_old = (
	timezoneUtcString: string,
): string =>
	new Intl.DateTimeFormat('en', {
		timeZone: timezoneUtcString,
		timeZoneName: 'long',
	})
		.format(new Date())
		.substring(10);

export const getFormattedTimezoneForMsgFromUtcOffset = (
	tzOffset: number,
): string => {
	const record = TimeZones.find(
		(tz) => tz.offset === tzOffset && tz.utc.length,
	);
	if (!record) {
		return 'UTC';
	}

	return record.displayTimezone;
};

export const getTimeBlockOptions = (
	timeFormat: 12 | 24,
	existingTime?: string,
): IOptionObject[] => {
	switch (timeFormat) {
		case 12:
			return getTimeBlockOptionsWithFormat('12hours', existingTime);
		case 24:
			return getTimeBlockOptionsWithFormat('24hours', existingTime);
	}
};

const getTimeBlockOptionsWithFormat = (
	displayFormat: '12hours' | '24hours',
	existingTime?: string,
): IOptionObject[] => {
	const optionBlocks: IOptionObject[] = [];

	if (existingTime) {
		// existingTime is in 12 hours format like 06:45 PM

		// check if existingTime is a multiple of 15 minutes, if not, add it to the options
		const existingTimeSplit = existingTime.split(':');
		const existingMinute = parseInt(existingTimeSplit[1].split(' ')[0], 10);

		if (existingMinute % 15 !== 0) {
			optionBlocks.push({
				text: {
					type: TextObjectType.PLAINTEXT,
					text: existingTime,
				},
				value: existingTime,
			});
		}
	}

	for (let i = 0; i < 24; i++) {
		for (let j = 0; j < 60; j += 15) {
			const hour24String = i < 10 ? `0${i}` : i;
			const minute = j < 10 ? `0${j}` : j;

			const hour12 = i === 0 ? 12 : i > 12 ? i - 12 : i;
			const hour12String = hour12 < 10 ? `0${hour12}` : hour12;

			const amPm = i < 12 ? 'AM' : 'PM';

			let extraMidnightOrNoon = '';
			if (i === 0 && j === 0) {
				extraMidnightOrNoon = ' (Midnight)';
			} else if (i === 12 && j === 0) {
				extraMidnightOrNoon = ' (Noon)';
			}

			const displayTime =
				displayFormat === '24hours'
					? `${hour24String}:${minute}${extraMidnightOrNoon}`
					: `${hour12String}:${minute} ${amPm}${extraMidnightOrNoon}`;

			optionBlocks.push({
				text: {
					type: TextObjectType.PLAINTEXT,
					text: displayTime,
				},
				value: `${hour12String}:${minute} ${amPm}`,
			});
		}
	}

	const sortedOptionBlocks = optionBlocks.sort((a, b) => {
		const aTime = a.value.split(' ')[0];
		const bTime = b.value.split(' ')[0];

		const aHour = parseInt(aTime.split(':')[0], 10);
		const bHour = parseInt(bTime.split(':')[0], 10);

		const aMinute = parseInt(aTime.split(':')[1], 10);
		const bMinute = parseInt(bTime.split(':')[1], 10);

		const aAmPm = a.value.split(' ')[1];
		const bAmPm = b.value.split(' ')[1];

		if (aAmPm === 'AM' && bAmPm === 'PM') {
			return -1;
		} else if (aAmPm === 'PM' && bAmPm === 'AM') {
			return 1;
		} else if (aAmPm === 'AM' && bAmPm === 'AM') {
			if (aHour === bHour) {
				return aMinute - bMinute;
			} else {
				if (aHour === 12) {
					return -1;
				} else if (bHour === 12) {
					return 1;
				}
				return aHour - bHour;
			}
		} else {
			// both are PM
			if (aHour === bHour) {
				return aMinute - bMinute;
			} else {
				if (aHour === 12) {
					return -1;
				} else if (bHour === 12) {
					return 1;
				}
				return aHour - bHour;
			}
		}
	});

	return sortedOptionBlocks;
};

export const getNearestTimeIn15MinInterval = (date: Date): string => {
	let hours = date.getUTCHours();
	const minutes = date.getUTCMinutes();
	let AmPm = hours >= 12 ? 'PM' : 'AM';
	hours = hours % 12;
	hours = hours ? hours : 12; // the hour '0' should be '12'
	let strMinutes = '';
	if (minutes >= 0 && minutes < 15) {
		strMinutes = '15';
	} else if (minutes >= 15 && minutes < 30) {
		strMinutes = '30';
	} else if (minutes >= 30 && minutes < 45) {
		strMinutes = '45';
	} else {
		strMinutes = '00';
		hours += 1;
		if (date.getUTCHours() === 12) {
			AmPm = 'PM'; // 11:45 AM  gets changed to 12:00 PM
		} else if (date.getUTCHours() === 23) {
			AmPm = 'AM'; // 11:45 PM  gets changed to 12:00 AM
		}
		hours = hours % 12;
		hours = hours ? hours : 12; // the hour '0' should be '12'
	}
	return `${hours <= 9 ? '0' : ''}${hours}:${strMinutes} ${AmPm}`;
};

export const getDateWithUTCOffset = (
	baseTime: Date,
	inputTzOffset: number,
	baseTzOffset?: number,
): Date => {
	const currentTzOffset =
		baseTzOffset === undefined
			? -baseTime.getTimezoneOffset() / 60
			: baseTzOffset; // in hours, i.e. -4 in NY
	const deltaTzOffset = inputTzOffset - currentTzOffset; // timezone diff

	const nowTimestamp = baseTime.getTime(); // get the number of milliseconds since unix epoch
	const deltaTzOffsetMilli = deltaTzOffset * 1000 * 60 * 60; // convert hours to milliseconds (tzOffsetMilli*1000*60*60)
	const outputDate = new Date(nowTimestamp + deltaTzOffsetMilli); // your new Date object with the timezone offset applied.

	return outputDate;
};

// possibly MAIN FUNCTION to get the user's timezone
export const getTimezoneUtcString = (tzOffset: number): string => {
	const record = TimeZones.find(
		(tz) => tz.offset === tzOffset && tz.utc.length,
	);
	if (!record) {
		return 'UTC';
	}

	return record.utc[0];
};

// date format: YYYY-MM-DD, time format: HH:MM AM/PM
// returns actual UTC time
export const parseDateAndTimeStringFromUI = (
	date: string,
	time: string,
	userUtcOffset: number,
): Date => {
	const [year, month, day] = date.split('-');
	const { hour, min } = convertTime12to24(time);

	const userDate =
		Date.UTC(
			Number(year),
			Number(month) - 1,
			Number(day),
			hour,
			min,
			0,
			0,
		) -
		userUtcOffset * 60 * 60 * 1000;

	return new Date(userDate);
};

export const convertTime12to24 = (
	time12h: string,
): { hour: number; min: number } => {
	const [time, modifier] = time12h.split(' ');

	// eslint-disable-next-line prefer-const
	let [hours, minutes] = time.split(':');

	if (hours === '12') {
		hours = '00';
	}

	if (modifier === 'PM') {
		hours = `${parseInt(hours, 10) + 12}`;
	}

	return { hour: parseInt(hours), min: parseInt(minutes) };
};

export const addHoursToDate = (date: Date, hours: number): Date => {
	return new Date(date.getTime() + hours * 60 * 60 * 1000);
};

export const addMinutesToDate = (date: Date, minutes: number): Date => {
	return new Date(date.getTime() + minutes * 60000);
};

export const addSecondsToDate = (date: Date, seconds: number): Date => {
	return new Date(date.getTime() + seconds * 1000);
};

// try not to use this function directly - use calculateNextSchedulingTime instead
// because there's a chance that the next schedule time is in the past
// and if that happens, the reminder will be sent immediately. Plus if the reminder has short interval
// it will be sent multiple times in a row
const getNextScheduleTime = (
	previousTime: Date,
	frequency: RecurringReminderFrequencies,
): Date => {
	switch (frequency) {
		case RecurringReminderFrequencies.DAILY: {
			return addMinutesToDate(previousTime, 24 * 60);
		}
		case RecurringReminderFrequencies.DAILY_WEEKDAYS: {
			// Monday to Thursday
			if (previousTime.getDay() >= 1 && previousTime.getDay() <= 4) {
				return addMinutesToDate(previousTime, 24 * 60);
			}
			// Friday to Sunday
			let daysSinceMonday = 0;
			switch (previousTime.getDay()) {
				case 5: {
					daysSinceMonday = 3;
					break;
				}
				case 6: {
					daysSinceMonday = 2;
					break;
				}
				case 0: {
					daysSinceMonday = 1;
					break;
				}
			}
			return addMinutesToDate(previousTime, daysSinceMonday * 24 * 60);
		}
		case RecurringReminderFrequencies.WEEKLY: {
			return addMinutesToDate(previousTime, 7 * 24 * 60);
		}
		case RecurringReminderFrequencies.BIWEEKLY: {
			return addMinutesToDate(previousTime, 2 * 7 * 24 * 60);
		}
		case RecurringReminderFrequencies.TRIWEEKLY: {
			return addMinutesToDate(previousTime, 3 * 7 * 24 * 60);
		}
		case RecurringReminderFrequencies.MONTHLY: {
			return new CustomDate(previousTime).addMonths(1);
		}
		case RecurringReminderFrequencies.QUARTERLY: {
			return new CustomDate(previousTime).addMonths(3);
		}
		case RecurringReminderFrequencies.BIANNUALLY: {
			return new CustomDate(previousTime).addMonths(6);
		}
		case RecurringReminderFrequencies.ANNUALLY: {
			return new CustomDate(previousTime).addMonths(12);
		}
		case RecurringReminderFrequencies.DO_NOT_REPEAT: {
			throw new Error('DO_NOT_REPEAT is not supported');
		}
	}
};

export const calculateNextSchedulingTime = (
	lastDueDate: Date,
	frequency: RecurringReminderFrequencies,
): Date => {
	let nextScheduleTime = getNextScheduleTime(lastDueDate, frequency);

	while (new CustomDate(nextScheduleTime).isLessThanOrEqualTo(new Date())) {
		nextScheduleTime = getNextScheduleTime(nextScheduleTime, frequency);
	}

	return nextScheduleTime;
};

export const getUpcomingMondayDate = (date: Date): Date => {
	const d = new Date(date);
	d.setUTCHours(0, 0, 0, 0);
	d.setUTCDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7));
	return d;
};

export enum DayOfWeek {
	SUNDAY = 'sun',
	MONDAY = 'mon',
	TUESDAY = 'tue',
	WEDNESDAY = 'wed',
	THURSDAY = 'thu',
	FRIDAY = 'fri',
	SATURDAY = 'sat',
}

export const getNextDayOfTheWeek = (
	dayName: DayOfWeek,
	excludeToday = true,
	refDate = new Date(),
): Date => {
	const dayOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(
		dayName.slice(0, 3).toLowerCase(),
	);
	if (dayOfWeek < 0) {
		throw new Error(`Invalid day of week: ${dayName}`);
	}
	refDate.setUTCHours(0, 0, 0, 0);
	refDate.setUTCDate(
		refDate.getUTCDate() +
			+!!excludeToday +
			((dayOfWeek + 7 - refDate.getUTCDay() - +!!excludeToday) % 7),
	);
	return refDate;
};

export class CustomDate extends Date {
	private _isLeapYear(year: number) {
		return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
	}

	private _getDaysInMonth(year: number, month: number) {
		return [
			31,
			this._isLeapYear(year) ? 29 : 28,
			31,
			30,
			31,
			30,
			31,
			31,
			30,
			31,
			30,
			31,
		][month];
	}

	isLeapYear() {
		return this._isLeapYear(this.getFullYear());
	}

	getDaysInMonth() {
		return this._getDaysInMonth(this.getFullYear(), this.getMonth());
	}

	addMonths(value: number) {
		const n = this.getDate();
		this.setDate(1);
		this.setMonth(this.getMonth() + value);
		this.setDate(Math.min(n, this.getDaysInMonth()));
		return this;
	}

	isLessThanOrEqualTo(anotherDate: Date): boolean {
		return this.getTime() <= anotherDate.getTime();
	}

	isSameDay(anotherDate: Date): boolean {
		return (
			this.getFullYear() === anotherDate.getFullYear() &&
			this.getMonth() === anotherDate.getMonth() &&
			this.getDate() === anotherDate.getDate()
		);
	}

	isSameUTCDay(anotherDate: Date): boolean {
		return (
			this.getUTCFullYear() === anotherDate.getUTCFullYear() &&
			this.getUTCMonth() === anotherDate.getUTCMonth() &&
			this.getUTCDate() === anotherDate.getUTCDate()
		);
	}

	isSameUTCHourMinAndSameDay(anotherDate: Date): boolean {
		return (
			this.getUTCHours() === anotherDate.getUTCHours() &&
			this.getUTCMinutes() === anotherDate.getUTCMinutes() &&
			this.isSameUTCDay(anotherDate)
		);
	}
}
