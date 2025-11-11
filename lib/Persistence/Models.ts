import {
	IPersistence,
	IPersistenceRead,
	IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
	RocketChatAssociationRecord,
	RocketChatAssociationModel,
} from '@rocket.chat/apps-engine/definition/metadata';
import {
	IBase,
	StorageDefinition,
	IndexedProperties,
	IModalClickEventLock,
	IReminderCreateModalUiData,
	IMsgReminderCreateModalUiData,
	IPreference,
	IAppInstaller,
	IReminderListModalActionUiData,
	ICustomSnoozeModalUiData,
	IInternalJobsLock,
	IReminderListModalUiData,
	IInternalJobsLastRun,
} from '../../definitions/Persistence';
import { IReminder } from '../../definitions/IReminder';

class BaseModel<T extends IBase<T>> {
	private baseAssociation: RocketChatAssociationRecord;
	private customStorageDefinition: StorageDefinition<T>;
	private indexedProperties: IndexedProperties<T>;

	constructor(
		name: string, // database name
		indexedProperties?: IndexedProperties<T>, // properties on which you'd query. Please ensure all indexed properties have type as string
		customStorageDefinition?: StorageDefinition<T>, // provide any custom definitions related to the stored properties. Note: this controls the association model type within persistence storage
	) {
		this.baseAssociation = new RocketChatAssociationRecord(
			RocketChatAssociationModel.MISC,
			name,
		);

		if (indexedProperties) {
			this.indexedProperties = indexedProperties;
		}

		if (customStorageDefinition) {
			this.customStorageDefinition = customStorageDefinition;
		}
	}

	public insertOne(persistence: IPersistence, doc: T): Promise<string> {
		return persistence.createWithAssociations(
			doc,
			this.convertModelToAssociation(doc, false),
		);
	}

	public insertOrUpdate(persistence: IPersistence, doc: T): Promise<string> {
		return persistence.updateByAssociations(
			this.convertModelToAssociation(doc, false),
			doc,
			true,
		);
	}

	public async findAll(
		read: IPersistenceRead,
		query?: Partial<T>,
	): Promise<T[]> {
		const data = await read.readByAssociations(
			this.convertModelToAssociation(query, true),
		);

		if (!data || !data.length) {
			return [];
		}

		return data as T[];
	}

	public async findOne(
		read: IPersistenceRead,
		query?: Partial<T>,
	): Promise<T | null> {
		const data = await this.findAll(read, query);
		if (!data || !data.length) {
			return null;
		}
		return data[0];
	}

	public clearAll(persistence: IPersistence): Promise<object[]> {
		return persistence.removeByAssociation(this.baseAssociation);
	}

	public clearByQuery(
		persistence: IPersistence,
		query: Partial<T>,
	): Promise<object[]> {
		return persistence.removeByAssociations(
			this.convertModelToAssociation(query, true),
		);
	}

	private convertModelToAssociation(
		model?: Partial<T>,
		isSelectQuery?: boolean,
	): RocketChatAssociationRecord[] {
		const associations: RocketChatAssociationRecord[] = [
			this.baseAssociation,
		];

		if (!model) {
			return associations;
		}

		if (
			isSelectQuery &&
			!this.indexedProperties &&
			Object.keys(model).length
		) {
			throw new Error(
				`Error! Trying to search on a non-indexed field. Also no index definition found. Please ensure you've indexed the field which you're using within query`,
			);
		}

		if (!this.indexedProperties) {
			return associations;
		}

		let key: keyof typeof model;
		for (key in model) {
			if (!this.indexedProperties[key]) {
				if (isSelectQuery) {
					throw new Error(
						`Error! Trying to search on a non-indexed field. Please ensure you've indexed the field which you're using within query`,
					);
				}
				// if its not a select query, then just ignore this property association since its not indexed
				continue;
			}

			const value = model[key];
			if (value === undefined) {
				throw new Error(
					`Error! Invalid Query. No value provided for query property ${String(
						key,
					)}`,
				);
			}

			if (typeof value !== 'string') {
				throw new Error(
					`Error! Please ensure that the indexed properties have a string value`,
				);
			}

			associations.push(
				new RocketChatAssociationRecord(
					this.getAssociationModel(key),
					value as string,
				),
			);
		}

		return associations;
	}

	private getAssociationModel(key: keyof T): RocketChatAssociationModel {
		return (
			(this.customStorageDefinition &&
				this.customStorageDefinition[key]) ||
			RocketChatAssociationModel.MISC
		);
	}
}

// Note: due to some weird circular dependency error, need to declare all the extended classes in the same file
class ModalClickEventLockClass extends BaseModel<IModalClickEventLock> {
	constructor() {
		super('modalClickEventLock', { viewId: 1 });
	}
}

// Stored in backup
class ReminderClass extends BaseModel<IReminder> {
	constructor() {
		super('task', { id: 1, createdBy: 1, roomId: 1, status: 1 });
	}

	public async markReminderAsComplete(
		read: IRead,
		persistence: IPersistence,
		reminder: IReminder,
	): Promise<void> {
		if (reminder.status === 'completed') {
			return;
		}

		// Note: since status property is indexed, we need to clear existing record first & then create a new one with "completed" status
		await Reminder.clearByQuery(persistence, { id: reminder.id });
		await Reminder.insertOrUpdate(persistence, {
			...reminder,
			status: 'completed',
			completedAt: new Date(),
		});
	}
}

class ReminderCreateModalUiDataClass extends BaseModel<IReminderCreateModalUiData> {
	constructor() {
		super('taskCreateModalUiData', { viewId: 1 });
	}
}

class MsgReminderCreateModalUiDataClass extends BaseModel<IMsgReminderCreateModalUiData> {
	constructor() {
		super('msgReminderCreateModalUiData', { viewId: 1 });
	}
}

class ReminderListModalActionUiDataClass extends BaseModel<IReminderListModalActionUiData> {
	constructor() {
		super('reminderListModalActionUiData', { viewId: 1 });
	}
}

class ReminderListModalUiDataClass extends BaseModel<IReminderListModalUiData> {
	constructor() {
		super('reminderListModalUiData', { viewId: 1 });
	}
}

class CustomSnoozeModalUiDataClass extends BaseModel<ICustomSnoozeModalUiData> {
	constructor() {
		super('customSnoozeModalUiData', { viewId: 1 });
	}
}

// Stored in backup
class UserPreferenceClass extends BaseModel<IPreference> {
	constructor() {
		super('userPreference', { userId: 1 });
	}
}

class AppInstallerClass extends BaseModel<IAppInstaller> {
	constructor() {
		super('appInstaller', {});
	}
}

class InternalJobsLockClass extends BaseModel<IInternalJobsLock> {
	constructor() {
		super('internalJobsLock', { jobId: 1 });
	}
}

class InternalJobsLastRunClass extends BaseModel<IInternalJobsLastRun> {
	constructor() {
		super('internalJobsLastRun', {});
	}

	public async updateLastRun(
		read: IPersistenceRead,
		persistence: IPersistence,
		jobId: keyof Required<IInternalJobsLastRun>,
	): Promise<void> {
		const lastRun = await this.findOne(read, {});
		if (!lastRun) {
			await this.insertOrUpdate(persistence, {
				[jobId]: new Date(),
			});
			return;
		}

		lastRun[jobId] = new Date();

		await this.insertOrUpdate(persistence, lastRun);
	}
}

export const ModalClickEventLock = new ModalClickEventLockClass();
export const Reminder = new ReminderClass();
export const ReminderCreateModalUiData = new ReminderCreateModalUiDataClass();
export const MsgReminderCreateModalUiData =
	new MsgReminderCreateModalUiDataClass();
export const ReminderListModalActionUiData =
	new ReminderListModalActionUiDataClass();
export const ReminderListModalUiData = new ReminderListModalUiDataClass();
export const CustomSnoozeModalUiData = new CustomSnoozeModalUiDataClass();
export const UserPreference = new UserPreferenceClass();
export const AppInstaller = new AppInstallerClass();
export const InternalJobsLock = new InternalJobsLockClass();
export const InternalJobsLastRun = new InternalJobsLastRunClass();
