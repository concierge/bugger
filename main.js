const arguments = require('concierge/arguments'),
    ExamWaiter = require('./detect.js'),
    selector = require('./selector.js'),
    configurationData = null;



exports.load = (platform) => {
    configurationData = exports.config.data || {};
    delete exports.config.data;
};

exports.unload = () = >{
    exports.config.data = configurationData;
};

const getYear = (year, semester, api, event) => {
    if (!configurationData[event.sender_id]) {
        throw new Error('Please --configure first.');
    }
    const waiter = new ExamWaiter(configurationData[event.sender_id].username, configurationData[event.sender_id].password);
    waiter.on('results', (results) => {
        let actualResults = select(results);
        console.log('Results are out!'.green);
        console.log('--------------------------------------------------------');
        console.log('Mark\tCourse'.yellow);
        console.log('--------------------------------------------------------');
        for (let k in actualResults) {
            if (!actualResults.hasOwnProperty(k)) {
                continue;
            }
            console.log(`${actualResults[k].mark.cyan}\t${actualResults[k].name} (${k})`);
        }
        readlineSync.keyIn('\nPress any key to exit.'.black.bgWhite, {
            hideEchoBack: true,
            mask: ''
        });
        process.exit(0); // make VS happy
    });

    waiter.on('loginFailure', () => {
        spinner.stop();
        clearConsole();
        console.log('Hmmmm.... either your login details were incorrect or something is broken.'.red.bold);
        process.exit(-1);
    });
    waiter.start();
};

exports.run = (api, event) => {
    const progArgs = [
        {
            long: '--configure',
            short: '-c',
            description: 'Configures bugger for your user. This must be used once and any configuration will replace old configuration.',
            expects: ['USERNAME', 'PASSWORD'],
            run: (out, values) => {
                if (!values[0] || !values[1]) {
                    out.log('What are you doing? I need a username and password.');
                }
                else {
                    configurationData[event.sender_id] = {
                        source: event.event_source,
                        id: event.sender_id,
                        name: event.sender_name,
                        username: values[0],
                        password: values[1]
                    };
                    out.log(`Configuration for '${event.sender_name}' has been updated.`);
                }
            }
        },
        {
            long: '--delete',
            short: '-d',
            description: 'Delete all configuration for your user.',
            run: (out) => {
                if (configurationData[event.sender_id]) {
                    delete configurationData[event.sender_id];
                    out.log(`Configuration for '${event.sender_name}' has been deleted.`);
                }
                else {
                    out.log('...how? You never configured it.');
                }
            }
        },
        {
            long: 'get',
            short: 'g',
            description: 'Adds a timestamp to each output log message.',
            expects: ['YEAR', 'SEMESTER'],
            run: (out, values) => {
                const year = parseInt(values[0]),
                    semester = parseInt(values[1]);
                if (isNaN(year) || isNaN(semester) || year < 2000 || year > (new Date()).getFullYear() || semester < 1 || semester > 2) {
                    throw new Error('Invalid arguments passed to get.');
                }
                out.log(`Getting results for ${year}:${semester}.`);
                getYear(year, semester, api, event);
            }
        },
        {
            long: 'notify',
            short: 'n',
            description: 'Notifies you when results for the current exams are out.',
            run: (out) => {
                if (configurationData[event.sender_id].notify) {
                    throw new Error('I am already going to notify you...');
                }
                configurationData[event.sender_id].notify = true;
                out.log('Will do.');
            }
        },
        {
            long: 'stop-notify',
            short: 's',
            description: 'Disables the notification when results for the current exams are out.',
            run: (out) => {
                if (!configurationData[event.sender_id].notify) {
                    throw new Error('I wasn\'t going to notify you anyway...');
                }
                delete configurationData[event.sender_id].notify;
                out.log('Consider it stopped.');
            }
        }
    ];

    let res;
    try {
        res = arguments.parseArguments(event.arguments, progArgs, {enabled:true,string:api.commandPrefix + 'bugger',colours:false}, false, false);
        if (res.unassociated.length > 0) {
            throw new Error(`What does "${res.unassociated.join(' ')}" mean?`);
        }

        if (Object.keys(res.parsed).length === 0) {
            throw new Error('Not entirely sure what you want me to do here. Maybe --help?');
        }
    }
    catch (e) {
        api.sendMessage(e.message, event.thread_id);
        return;
    }

    for (let key of Object.keys(res)) {
        const arg = res[key];
        if (arg.output && arg.output.length > 0) {
            api.sendMessage(arg.output, event.thread_id);
        }
    }
};



// ﻿let ExamWaiter = require('./detect.js'),
//     select = require('./selector.js'),
//     readlineSync = require('readline-sync'),
//     spinner = require('simple-spinner'),
//     clearConsole = () => {
//         process.stdout.write("\u001b[2J\u001b[0;0H");
//     },
//     colours = require('colors'),
//     userName = readlineSync.question('Username: '.yellow),
//     password = readlineSync.question('Password: '.yellow, {
//         hideEchoBack: true
//     });
//
// clearConsole();
// console.log('Waiting for results...'.cyan);
// spinner.start();
//
// let waiter = new ExamWaiter(userName, password);
// waiter.on('results', (results) => {
//     let actualResults = select(results);
//     spinner.stop();
//     clearConsole();
//     console.log('Results are out!'.green);
//     console.log('--------------------------------------------------------');
//     console.log('Mark\tCourse'.yellow);
//     console.log('--------------------------------------------------------');
//     for (let k in actualResults) {
//         if (!actualResults.hasOwnProperty(k)) {
//             continue;
//         }
//         console.log(`${actualResults[k].mark.cyan}\t${actualResults[k].name} (${k})`);
//     }
//     readlineSync.keyIn('\nPress any key to exit.'.black.bgWhite, {
//         hideEchoBack: true,
//         mask: ''
//     });
//     process.exit(0); // make VS happy
// });
//
// waiter.on('loginFailure', () => {
//     spinner.stop();
//     clearConsole();
//     console.log('Hmmmm.... either your login details were incorrect or something is broken.'.red.bold);
//     process.exit(-1);
// });
// waiter.start();
