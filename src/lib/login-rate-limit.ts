export function createLoginAttemptLimiter(limit = 10, windowMs = 60_000) {
  const attempts = new Map<string, { count: number; until: number }>();
  return (ip: string, now = Date.now()) => {
    for (const [key, value] of attempts)
      if (value.until <= now) attempts.delete(key);
    const record = attempts.get(ip) ?? { count: 0, until: now + windowMs };
    record.count++;
    attempts.set(ip, record);
    return record.count <= limit;
  };
}

const allowLoginAttempt = createLoginAttemptLimiter();

export function loginAttemptAllowed(ip: string, now = Date.now()) {
  return allowLoginAttempt(ip, now);
}
