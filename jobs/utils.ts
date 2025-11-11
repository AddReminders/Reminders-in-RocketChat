import {
	HttpStatusCode,
	IAppAccessors,
	IEnvironmentRead,
	IHttp,
	ILogger,
	IModify,
	IPersistence,
	IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ServerSetting } from '../config/Settings';
import { JobIdsWithLock } from '../definitions/Persistence';
import { JobId } from '../enums/Jobs';
import { InternalJobsLock } from '../lib/Persistence/Models';
import { getServerSettingValue } from '../lib/utils';

export const lockJobWithTriggerIdViaEndpoint = async (
	read: IEnvironmentRead,
	http: IHttp,
	providedApiEndpoints: IAppAccessors['providedApiEndpoints'],
	jobId: JobId,
	triggerId: string,
) => {
	const serverUrl: string = await getServerSettingValue(
		read,
		ServerSetting.SITE_URL,
	);
	if (!serverUrl) {
		throw new Error('Site URL is not configured.');
	}
	// remove trailing slash
	const url = serverUrl.replace(/\/$/, '');

	const lockInternalJobsEndpoint = providedApiEndpoints.find(
		(endpoint) => endpoint.path === 'lockInternalJobs',
	);
	if (!lockInternalJobsEndpoint) {
		throw new Error(
			'Could not find lockInternalJobs endpoint in providedApiEndpoints',
		);
	}

	const lockInternalJobsUrl = `${url}${lockInternalJobsEndpoint.computedPath}`;

	const response = await http.post(lockInternalJobsUrl, {
		data: {
			triggerId,
			jobId,
		},
	});
	if (response.statusCode !== HttpStatusCode.OK) {
		throw new Error(
			`Failed to lock internal jobs. Status code: ${response.statusCode}, url: ${lockInternalJobsUrl}, response - ${response.content}`,
		);
	}
};

export const scheduleAndLockJob = async <T extends { triggerId: string }>(
	modify: IModify,
	persis: IPersistence,
	jobId: JobIdsWithLock,
	when: Date,
	data: T,
) => {
	await modify.getScheduler().scheduleOnce({
		id: jobId,
		when,
		data,
	});

	await InternalJobsLock.insertOrUpdate(persis, {
		jobId: jobId,
		triggerId: data.triggerId,
		lockedAt: new Date(),
	});
};

export const shouldExecuteJob = async (
	read: IRead,
	jobName: JobIdsWithLock,
	currentJobTriggerId: string,
	logger: ILogger,
): Promise<boolean> => {
	// verify if the trigger id is the same as the one in the database
	const internalJobsLockEntry = await InternalJobsLock.findOne(
		read.getPersistenceReader(),
		{
			jobId: jobName,
		},
	);
	if (
		internalJobsLockEntry &&
		internalJobsLockEntry.triggerId !== currentJobTriggerId
	) {
		logger.debug(
			`Trigger id ${currentJobTriggerId} is not the same as the one in the database ${internalJobsLockEntry.triggerId}. Checking if timeout of 10 seconds has expired...`,
		);

		const toleranceInHours = 24;

		const diffHours = Math.abs(
			new Date().getTime() -
				new Date(internalJobsLockEntry.lockedAt).getTime(),
		);

		if (diffHours < toleranceInHours) {
			logger.debug(
				`Timeout of ${toleranceInHours} hours has not expired. Not executing job ${jobName}`,
			);
		} else {
			logger.debug(
				`Timeout of ${toleranceInHours} hours has expired. Executing job ${jobName}`,
			);
			return true;
		}

		return false;
	}

	return true;
};
