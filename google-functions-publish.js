#!/usr/bin/env node
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import boxen from 'boxen';
import { execa, ExecaError } from 'execa';
import prompts from 'prompts';
import logger from 'cli-logger';
var log = logger();
var PropertyType;
(function (PropertyType) {
    PropertyType[PropertyType["Array"] = 0] = "Array";
    PropertyType[PropertyType["Boolean"] = 1] = "Boolean";
    PropertyType[PropertyType["Number"] = 2] = "Number";
    PropertyType[PropertyType["String"] = 3] = "String";
})(PropertyType || (PropertyType = {}));
const APP_NAME = 'Publish Google Functions';
const APP_SHORT_NAME = 'gfpub';
const APP_AUTHOR = 'by John M. Wargo (https://johnwargo.com)';
const APP_CONFIG_FILE = 'gfpub.json';
function compareFunction(a, b) {
    if (a.property < b.property) {
        return -1;
    }
    if (a.property > b.property) {
        return 1;
    }
    return 0;
}
function buildConfigObject() {
    return {
        functionFolders: [],
        flags: []
    };
}
function readConfigFile(configFilePath) {
    try {
        return JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
    }
    catch (err) {
        log.error(`${chalk.red('Error:')} Unable to read ${configFilePath}`);
        console.dir(err);
        process.exit(1);
    }
}
function saveConfigFile(configFilePath, configObject) {
    log.info(`Writing configuration file ${configFilePath}`);
    let outputStr = JSON.stringify(configObject, null, 2);
    outputStr = outputStr.replace(/\\/g, '/');
    outputStr = outputStr.replaceAll('//', '/');
    var result = true;
    try {
        fs.writeFileSync(path.join('.', configFilePath), outputStr, 'utf8');
        log.info('Output file written successfully');
        log.info(`\nOpen ${chalk.yellow(configFilePath)} in an editor to modify configuration settings.`);
    }
    catch (err) {
        log.error(`${chalk.red('Error:')} Unable to write to ${APP_CONFIG_FILE}`);
        console.dir(err);
        result = false;
    }
    return result;
}
function directoryExists(filePath) {
    if (fs.existsSync(filePath)) {
        try {
            return fs.lstatSync(filePath).isDirectory();
        }
        catch (err) {
            log.error(`checkDirectory error: ${err}`);
            return false;
        }
    }
    return false;
}
function isFolderArrayValid(configValue, folders) {
    var missingFolders = folders.filter(folder => !directoryExists(path.join(process.cwd(), folder)));
    if (missingFolders.length > 0) {
        log.error(`\n${chalk.red('Error:')} Configuration property ${chalk.yellow(configValue)} contains invalid path entries (folder does not exist).`);
        var folderStr = missingFolders.length > 1 ? 'Folders' : 'Folder';
        log.error(`${folderStr}: ${missingFolders.join(', ')}`);
    }
    return missingFolders.length === 0;
}
function getlocalFolders() {
    let folders = fs.readdirSync(process.cwd(), { withFileTypes: true });
    let choices = [];
    for (const folder of folders) {
        if (folder.isDirectory()) {
            choices.push({ title: folder.name, value: folder.name });
        }
    }
    return choices;
}
console.log(chalk.green(boxen(APP_NAME, { padding: 1 })));
console.log(`${APP_AUTHOR}`);
const myArgs = process.argv.slice(2);
const debugMode = myArgs.includes('-d');
log.level(debugMode ? log.DEBUG : log.INFO);
log.debug(chalk.green('Debug mode enabled'));
log.debug(`Working directory: ${path.join(process.cwd(), path.sep)}`);
const configFilePath = path.join(process.cwd(), APP_CONFIG_FILE);
log.info(`Configuration path: ${configFilePath}`);
if (!fs.existsSync(configFilePath)) {
    log.info(chalk.red('\nConfiguration file missing: '));
    log.info('Rather than requiring the use of a bunch of command-line arguments, this tool uses a configuration file instead.');
    log.info('In the next step, the module will automatically create the configuration file for you.');
    log.info('Once it completes, you can edit the configuration file to change the default values and execute the command again.\n');
    let response = await prompts({
        type: 'confirm',
        name: 'continue',
        message: chalk.green('Create configuration file?'),
        initial: true
    });
    if (response.continue) {
        let configObject = buildConfigObject();
        if (debugMode)
            console.dir(configObject);
        const configPrompts = [
            {
                type: 'confirm',
                name: 'useDefaultFlags',
                message: chalk.green('Use default flags?'),
                initial: true
            },
            {
                type: 'multiselect',
                name: 'folders',
                message: chalk.green('Select one or more function folders to deploy:'),
                choices: getlocalFolders(),
            }
        ];
        let fileOptions = await prompts(configPrompts);
        if (debugMode)
            console.dir(fileOptions);
        configObject.functionFolders = fileOptions.folders;
        if (fileOptions.useDefaultFlags) {
            log.debug('Using default flags');
            configObject.flags.push('--region=us-east1');
            configObject.flags.push('--runtime=nodejs20');
            configObject.flags.push('--trigger-http');
            configObject.flags.push('--allow-unauthenticated');
        }
        if (saveConfigFile(configFilePath, configObject)) {
            if (process.env.TERM_PROGRAM == "vscode") {
                try {
                    await execa('code', [configFilePath]);
                }
                catch (err) {
                    log.error(err);
                    process.exit(1);
                }
                process.exit(0);
            }
        }
        process.exit(1);
    }
    else {
        log.info('Exiting...');
        process.exit(0);
    }
}
const configObject = readConfigFile(configFilePath);
if (!isFolderArrayValid('functionFolders', configObject.functionFolders)) {
    log.error("The configuration file's functionFolders array is empty, exiting...");
    process.exit(1);
}
if (configObject.flags.length < 1) {
    log.error("The configuration file's flags array is empty, exiting...");
    process.exit(1);
}
for (const func of configObject.functionFolders) {
    var flagStr = configObject.flags.join(' ');
    var deployCmd = `gcloud functions deploy ${func} ${flagStr}`;
    process.chdir(func);
    log.info(`\n${APP_SHORT_NAME}: Deploying the ${chalk.yellow(func)} function\n`);
    log.info(deployCmd);
    try {
        await execa({ stdout: 'inherit', stderr: 'inherit' }) `${deployCmd}`;
    }
    catch (error) {
        if (error instanceof ExecaError) {
            log.info(chalk.red('Execa Error:'));
        }
        else {
            log.info(chalk.red('Error:'));
        }
        log.info(error);
        process.exit(1);
    }
    log.info(`\n${APP_SHORT_NAME}: ${chalk.yellow(func)} function deployed`);
    process.chdir('..');
}
log.info(chalk.green(`\n${APP_SHORT_NAME}: All functions deployed successfully`));
