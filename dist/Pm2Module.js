'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * Created by desaroger on 25/02/17.
 */

var _ = require('lodash');
var childProcess = require('child_process');
var WebhookServer = require('./WebhookServer');

var _require = require('./utils'),
    log = _require.log;

var Pm2Module = function () {
    function Pm2Module() {
        var processes = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
        var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

        _classCallCheck(this, Pm2Module);

        options.routes = Pm2Module._parseProcesses(processes);
        this.routes = options.routes;
        this.webhookServer = new WebhookServer(options);
        this.runningCommand = {};
    }

    _createClass(Pm2Module, [{
        key: 'start',
        value: function start() {
            var _this = this;

            return this.webhookServer.start().then(function () {
                var msg = 'Started. Routes:\n';
                _.forOwn(_this.routes, function (route, name) {
                    msg += ' - ' + name + ': ' + JSON.stringify(route) + '\n';
                });
                log(msg);
            });
        }
    }, {
        key: 'stop',
        value: function stop() {
            return this.webhookServer.stop().then(function () {
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

    }], [{
        key: '_parseProcesses',
        value: function _parseProcesses(processes) {
            return processes.map(function (p) {
                return Pm2Module._parseProcess(p);
            }).filter(function (p) {
                return !!p;
            }).reduce(function (routes, app) {
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

    }, {
        key: '_parseProcess',
        value: function _parseProcess(app) {
            // Check data
            if (!app || !app.pm2_env) {
                return null;
            }
            var config = app.pm2_env.env_hook;
            if (!config) {
                log('No options found for "' + app.name + '" route');
                return null;
            }
            if (config === true) {
                config = {};
            }

            // Config to WebhookServer route
            var self = this;
            var name = app.name || 'unknown';
            var cwd = config.cwd || app.pm_cwd || app.pm2_env.cwd || app.pm2_env.pm_cwd;
            // eslint-disable-next-line prefer-object-spread
            var commandOptions = Object.assign({}, { cwd: cwd }, config.commandOptions || {});
            var route = {
                name: name,
                type: config.type,
                secret: config.secret,
                method: function method(payload) {
                    log('Parsed payload: ' + JSON.stringify(payload));
                    try {
                        if (config.command) {
                            log('Running command: ' + config.command);
                            self._runCommand(name, config.command, commandOptions, function (m) {
                                return log(name + ': ' + m);
                            }).catch(function (e) {
                                return onError(name, e);
                            });
                        }
                    } catch (e) {
                        onError(name, e);
                    }
                }
            };
            route = cleanObj(route);

            return route;

            function onError(routeName, e) {
                var err = e.message || e;
                log('Error on "' + name + '" route: ' + err, 2);
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

    }, {
        key: '_runCommand',
        value: function _runCommand(name, command) {
            var _this2 = this;

            var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
            var logFn = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : log;

            _.defaults(options, {
                env: process.env,
                shell: true
            });

            return new Promise(function (resolve, reject) {
                _this2._killRunningCommand(name);
                var child = childProcess.spawn('eval', [command], options);
                if (!_this2.runningCommand) {
                    _this2.runningCommand = {};
                }
                _this2.runningCommand[name] = child;

                var errors = "";

                child.stdout.setEncoding('utf8');
                child.stdout.on('data', function (data) {
                    logFn(data);
                });

                child.stderr.setEncoding('utf8');
                child.stderr.on('data', function (data) {
                    logFn(data);

                    data = data.toString();
                    errors += data;
                });

                child.on('close', function (code) {
                    if (!code) {
                        resolve();
                    } else {
                        reject(errors);
                    }
                });
            });
        }
    }, {
        key: '_killRunningCommand',
        value: function _killRunningCommand(name) {
            try {
                if (this.runningCommand && this.runningCommand[name]) {
                    this.runningCommand[name].kill('SIGINT');
                    this.runningCommand[name] = null;
                }
            } catch (e) {
                console.log(e);
            }
        }
    }]);

    return Pm2Module;
}();

module.exports = Pm2Module;

function cleanObj(obj) {
    return _(obj).omitBy(_.isUndefined).value();
}