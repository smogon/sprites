
export default {
    preset: 'ts-jest/presets/js-with-ts',
    testEnvironment: 'node',
    // ts-jest doesn't like esm
    moduleNameMapper: {
        '^(.*).js$': '$1'
    },
    globals: {
        'ts-jest': {
            packageJson: 'package.json'
        }
    }
};
