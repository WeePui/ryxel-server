import mongoose from 'mongoose';

export async function withRetryTransaction(
  fn: (session: mongoose.ClientSession) => Promise<any>,
  maxRetries = 3
) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const result = await fn(session);
      await session.commitTransaction();
      session.endSession();
      return result;
    } catch (err: any) {
      await session.abortTransaction();
      session.endSession();
      if (err.codeName === 'WriteConflict' && attempt < maxRetries - 1) {
        console.warn(
          `Write conflict, retrying transaction (${attempt + 1})...`
        );
        await new Promise((res) => setTimeout(res, 100)); // chờ 100ms
        continue;
      }
      throw err;
    }
  }
  throw new Error('Transaction failed after retries');
}
