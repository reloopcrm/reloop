UPDATE "appSetting"
SET "agentProvider" = 'openrouter',
    "agentReadingModel" = NULL,
    "agentDraftModel" = NULL
WHERE "agentProvider" = 'gateway';
