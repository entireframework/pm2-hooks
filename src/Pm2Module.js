/**
 * Created by desaroger on 25/02/17.
 */

let _ = require('lodash');
let childProcess = require('child_process');
let WebhookServer = require('./WebhookServer');
let { log } = require('./utils');

class Pm2Module {

    constructor(processes = [], options = {}) {
        options.routes = Pm2Module._parseProcesses(processes);
        this.routes = options.routes;
        this.webhookServer = new WebhookServer(options);
        this.runningCommand = {};
    }

    start() {
        return this.webhookServer.start()
            .then(() => {
                let msg = 'Started. Routes:\n';
                _.forOwn(this.routes, (route, name) => {
                    msg += ` - ${name}: ${JSON.stringify(route)}\n`;
                });
                log(msg);
            });
    }

    stop() {
        return this.webhookServer.stop()
            .then(() => {
                log('Stopped.');
            });
    }

    /**
     * Converts an array of PM2 processes to an object structured
     * for the WebhookServer routes. It internally uses the _parseProcess
     * method
     *
     * Example 1:
     * - input:
     * [
     *      { pm2_env: { env_hook: { name: 'api', type: 'bitbucket' } } },
     *      { pm2_env: { env_hook: { name: 'panel', type: 'github' } } }
     * ]
     * - output:
     * {
     *      api: { type: 'bitbucket' },
     *      panel: { type: 'github' }
     * }
     *
     * @param processes
     * @returns {*}
     * @private
     */
    static _parseProcesses(processes) {
        return processes
            .map((p) => Pm2Module._parseProcess(p))
            .filter((p) => !!p)
            .reduce((routes, app) => {
                routes[app.name] = app;
                delete app.name;
                return routes;
            }, {});
    }

    /**
     * Converts a PM2 process object to an object for WebhookServer
     * route.
     *
     * Example 1:
     * - input: { pm2_env: { env_hook: { name: 'api', type: 'bitbucket' } } }
     * - output: { name: 'api', type: 'bitbucket' }
     * Example 2:
     * - input: { pm2_env: { env_hook: { type: 'bitbucket' } } }
     * - output: { name: 'unknown', type: 'bitbucket' }
     *
     * @param app The Pm2 process
     * @returns {object|null} The route object, or null if invalid
     * @private
     */
    static _parseProcess(app) {
        // Check data
        if (!app || !app.pm2_env) {
            return null;
        }
        let config = app.pm2_env.env_hook;
        if (!config) {
            log(`No options found for "${app.name}" route`);
            return null;
        }
        if (config === true) {
            config = {};
        }

        // Config to WebhookServer route
        let self = this;
        let name = app.name || 'unknown';
        let cwd = config.cwd || app.pm_cwd || app.pm2_env.cwd || app.pm2_env.pm_cwd;
        // eslint-disable-next-line prefer-object-spread
        let commandOptions = Object.assign({}, { cwd }, config.commandOptions || {});
        let route = {
            name,
            type: config.type,
            secret: config.secret,
            method(payload) {
                log(`Parsed payload: ${JSON.stringify(payload)}`);
                try {
                    if (config.command) {
                        log(`Running command: ${config.command}`);
                        self._runCommand(
                            name,
                            config.command,
                            commandOptions,
                            (m) => log(`${name}: ${m}`)
                        )
                            .catch((e) => onError(name, e));
                    }
                } catch (e) {
                    onError(name, e);
                }
            }
        };
        route = cleanObj(route);

        return route;

        function onError(routeName, e) {
            let err = e.message || e;
            log(`Error on "${name}" route: ${err}`, 2);
            throw e;
        }
    }

    /**
     * Runs a line command.
     *
     * @param {String} name The route name
     * @param {String} command The line to execute
     * @param {Object} options The object options
     * @returns {Promise<code>} The code of the error, or a void fulfilled promise
     * @private
     */
    static _runCommand(name, command, options = {}, logFn = log) {
        _.defaults(options, {
            env: process.env,
            shell: true
        });

        return new Promise((resolve, reject) => {
            this._killRunningCommand(name);
            let child = childProcess.spawn('eval', [command], options);
            if (!this.runningCommand) {
                this.runningCommand = {};
            }
            this.runningCommand[name] = child;
            console.log('_runCommand', name, this.runningCommand)

            let errors = "";

            child.stdout.setEncoding('utf8');
            child.stdout.on('data', (data) => {
                logFn(data);
            });

            child.stderr.setEncoding('utf8');
            child.stderr.on('data', (data) => {
                logFn(data);

                data = data.toString();
                errors += data;
            });

            child.on('close', (code) => {
                if (!code) {
                    resolve();
                } else {
                    reject(errors);
                }
            });
        });
    }

    static _killRunningCommand(name) {
        try {
            console.log('_killRunningCommand', name, this.runningCommand)
            if (this.runningCommand && this.runningCommand[name]) {
                this.runningCommand[name].kill();
                this.runningCommand[name] = null;
            }
        } catch (e) {
            console.log(e);
        }
    }
}

module.exports = Pm2Module;

function cleanObj(obj) {
    return _(obj).omitBy(_.isUndefined).value();
}
