import { IBackup } from '../definitions/IBackup';
import { createCipheriv, createDecipheriv } from 'crypto';

const superSecretInitializationVector = 'cc840d37e0338ee3bba39c8c0520ad46';
const superSecretPassword =
	'dcf11d0d3977fed3142445abc8d5ef94e1fc57133c7363d75ca8207b0f8326d8';
const algorithm = 'aes-256-cbc';

export const encryptBackupData = (data: IBackup): Buffer => {
	const cipher = createCipheriv(
		algorithm,
		Buffer.from(superSecretPassword, 'hex'),
		Buffer.from(superSecretInitializationVector, 'hex'),
	);

	return Buffer.from(
		`${cipher.update(JSON.stringify(data), 'utf8', 'binary')}${cipher.final(
			'binary',
		)}`,
		'binary',
	);
};

export const decryptBackupData = (data: Buffer): IBackup => {
	const decipher = createDecipheriv(
		algorithm,
		Buffer.from(superSecretPassword, 'hex'),
		Buffer.from(superSecretInitializationVector, 'hex'),
	);

	let decryptedData = decipher.update(data, 'binary', 'utf8');
	decryptedData += decipher.final('utf8');

	return JSON.parse(decryptedData);
};
