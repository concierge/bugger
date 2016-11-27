const args = require('concierge/arguments'),
    ExamWaiter = require('./detect.js'),
    selector = require('./selector.js');

const getResults = (year, semester, api, event) => {
    if (!exports.config[event.sender_id]) {
        throw new Error('Please use "configure" first.');
    }
    if (year && semester) {
        api.sendMessage(`Getting results for ${year}-${semester}. Please note that if myuc is down this will not complete until it is up again.`, event.thread_id);
    }
    const waiter = new ExamWaiter(exports.config[event.sender_id].username, exports.config[event.sender_id].password, !(year && semester));
    waiter.on('results', (results) => {
        if (!api) {
            api = exports.platform.getIntegrationApis()[exports.config[event.sender_id].source];
        }
        const actualResults = selector(results, year, semester);
        let res = '--------------------------------------------------------\nMark\tCourse\n';
        res += '--------------------------------------------------------\n';
        for (let k in actualResults) {
            if (!actualResults.hasOwnProperty(k)) {
                continue;
            }
            res += `${actualResults[k].mark}\t${actualResults[k].name} (${k})\n`;
        }
        api.sendMessage(res, event.thread_id);
    });

    waiter.on('loginFailure', () => {
        if (!api) {
            api = exports.platform.getIntegrationApis()[exports.config[event.sender_id].source];
        }
        api.sendMessage(`Hmmmm.... ${event.sender_name}, either your login details were incorrect or something is broken.`, event.thread_id);
    });
    if (!exports.config[event.sender_id].waiters) {
        exports.config[event.sender_id].waiters = [];
    }
    if (year === null && semester === null) {
        exports.config[event.sender_id].waiters.unshift(waiter);
    }
    else {
        exports.config[event.sender_id].waiters.push(waiter);
    }
    waiter.start();
};

exports.load = (platform) => {
    for (let key in Object.keys(exports.config)) {
        if (exports.config[key].waiters) {
            delete exports.config[key].waiters;
        }
        if (!exports.config[key].notify) {
            continue;
        }
        const event = {
            thread_id: exports.config[key].thread,
            sender_id: exports.config[key].id,
            sender_name: exports.config[key].name,
            event_source: exports.config[key].source
        };
        getResults(null, null, null, event);
    }
};

exports.unload = () => {
    for (let key in Object.keys(exports.config)) {
        if (!exports.config[key].waiters) {
            continue;
        }
        for (let waiter of exports.config[key].waiters) {
            waiter.stop();
        }
        delete exports.config[key].waiters;
    }
};

exports.run = (api, event) => {
    const progArgs = [
        {
            long: 'configure',
            short: 'c',
            description: 'Configures bugger for your user. This must be used once and any configuration will replace old configuration.',
            expects: ['USERNAME', 'PASSWORD'],
            run: (out, values) => {
                if (!values[0] || !values[1]) {
                    out.log('What are you doing? I need a username and password.');
                }
                else {
                    exports.config[event.sender_id] = {
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
            long: 'delete',
            short: 'd',
            description: 'Delete all configuration for your user.',
            run: (out) => {
                if (exports.config[event.sender_id]) {
                    if (exports.config[key].waiters) {
                        for (let waiter of exports.config[key].waiters) {
                            waiter.stop();
                        }
                    }
                    delete exports.config[event.sender_id];
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
                getResults(year, semester, api, event);
            }
        },
        {
            long: 'notify',
            short: 'n',
            description: 'Notifies you when results for the current exams are out.',
            run: (out) => {
                if (exports.config[event.sender_id].notify) {
                    throw new Error('I am already going to notify you...');
                }
                exports.config[event.sender_id].notify = true;
                exports.config[event.sender_id].thread = event.thread_id;
                out.log('Will do.');
                getResults(null, null, api, event);
            }
        },
        {
            long: 'stop-notify',
            short: 's',
            description: 'Disables the notification when results for the current exams are out.',
            run: (out) => {
                if (!exports.config[event.sender_id].notify) {
                    throw new Error('I wasn\'t going to notify you anyway...');
                }
                delete exports.config[event.sender_id].notify;
                out.log('Consider it stopped.');
                const notify = exports.config[event.sender_id].waiters.shift();
                notify.stop();
            }
        }
    ];

    event.arguments.shift();
    let res;
    try {
        res = args.parseArguments(event.arguments,progArgs,{enabled:true,string:api.commandPrefix + 'bugger',colours:false}, false, false);
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

    for (let key of Object.keys(res.parsed)) {
        const arg = res.parsed[key];
        if (arg.out && arg.out.length > 0) {
            api.sendMessage(arg.out, event.thread_id);
        }
    }
};
