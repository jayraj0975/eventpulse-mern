function requireTestMongoUri() {
    const uri = process.env.TEST_MONGO_URI;

    if (!uri) {
        throw new Error(
            'Refusing to run database tests without TEST_MONGO_URI. Use a disposable MongoDB database whose name contains "test".'
        );
    }

    let databaseName;
    try {
        databaseName = new URL(uri).pathname.replace(/^\/+/, '').split('/')[0];
    } catch {
        throw new Error('TEST_MONGO_URI is not a valid MongoDB connection URI.');
    }

    if (!databaseName || !/test/i.test(databaseName)) {
        throw new Error(
            'Refusing to run destructive integration tests: the TEST_MONGO_URI database name must contain "test".'
        );
    }

    if (process.env.MONGO_URI && uri === process.env.MONGO_URI) {
        throw new Error('Refusing to run tests against MONGO_URI. Use a separate disposable TEST_MONGO_URI.');
    }

    return uri;
}

module.exports = requireTestMongoUri;
