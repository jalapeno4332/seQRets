/// <reference lib="webworker" />

// Step 1: Polyfill Buffer BEFORE any crypto imports.
// Must use dynamic import for the crypto module to guarantee execution order,
// because static ES imports are hoisted and run before any top-level code.
import './buffer-setup';

async function initWorker() {
    // Step 2: Now that Buffer is globally available, import crypto functions.
    const { createShares, restoreSecret, decryptInstructions, encryptVault, decryptVault } = await import('./crypto');

    self.addEventListener('message', async (event: MessageEvent<{ type: string, payload: any }>) => {
        const { type, payload } = event.data;

        try {
            if (type === 'createShares') {
                const result = await createShares(payload);
                self.postMessage({ type: 'createSharesSuccess', payload: result });
            } else if (type === 'restoreSecret') {
                const result = await restoreSecret(payload);
                self.postMessage({ type: 'restoreSecretSuccess', payload: result });
            } else if (type === 'decryptInstructions') {
                const result = await decryptInstructions(payload);
                self.postMessage({ type: 'decryptInstructionsSuccess', payload: result });
            } else if (type === 'encryptVault') {
                const result = await encryptVault(payload.jsonString, payload.password);
                self.postMessage({ type: 'encryptVaultSuccess', payload: result });
            } else if (type === 'decryptVault') {
                const result = await decryptVault(payload.salt, payload.data, payload.password);
                self.postMessage({ type: 'decryptVaultSuccess', payload: result });
            }
        } catch (e: any) {
            const error = { message: e.message, name: e.name, stack: e.stack };
            if (type === 'createShares') {
                self.postMessage({ type: 'createSharesError', payload: error });
            } else if (type === 'restoreSecret') {
                self.postMessage({ type: 'restoreSecretError', payload: error });
            } else if (type === 'decryptInstructions') {
                self.postMessage({ type: 'decryptInstructionsError', payload: error });
            } else if (type === 'encryptVault') {
                self.postMessage({ type: 'encryptVaultError', payload: error });
            } else if (type === 'decryptVault') {
                self.postMessage({ type: 'decryptVaultError', payload: error });
            }
        }
    });

    // Signal that the worker is ready
    self.postMessage({ type: 'ready' });
}

initWorker().catch((e) => {
    console.error('Crypto worker init failed:', e);
    self.postMessage({ type: 'initError', payload: { message: e.message, name: e.name, stack: e.stack } });
});
