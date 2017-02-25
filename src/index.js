/**
 * Created by desaroger on 21/02/17.
 */

let pmx = require('pmx');
let pm2 = require('pm2');
let Pm2Module = require('./Pm2Module');

pmx.initModule({}, (errPMX, conf) => {
    pm2.connect((errPM2) => {
        if (errPMX || errPM2) {
            console.error(errPMX || errPM2); // eslint-disable-line no-console
            return;
        }
        pm2.list((err, apps) => {
            let pm2Module = new Pm2Module(apps, {});
            pm2Module.start();
            console.log('apps', apps); // eslint-disable-line no-console
        });
    });
});
