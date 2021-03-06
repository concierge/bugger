const request = require('request'),
    events = require('events'),
    htmlEntities = require('html-entities').AllHtmlEntities,
    selector = require('./selector.js');

class ExamWaiter extends events.EventEmitter {
    constructor(username, password, repeatUntilFound = false, shortTimeout = 300000, longTimeout = 10800000) {
        super();
        this._timerInstance = null;
        this._username = username;
        this._password = password;
        this._repeat = repeatUntilFound;
        this._longTimeout = longTimeout;
        this._shortTimeout = shortTimeout;
        this._timeout = repeatUntilFound ? longTimeout : shortTimeout;
        this._jar = request.jar();
    }

    _makeReq(url) {
        const callback = arguments[arguments.length - 1],
            self = this,
            options = {
                url: url,
                headers: {},
                jar: self._jar
            };

        if (arguments.length === 3) {
            options.headers['Referer'] = arguments[1];
        }

        if (arguments.length === 4) {
            options.method = 'POST';
            options.body = arguments[2];
            options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }

        request(options, (error, response, body) => {
            if (error) {
                return null;
            }

            let redirectRegex = /http-equiv="refresh" ((?!http).)+([^";]+)/igm,
                redirect = redirectRegex.exec(body);

            if (redirect && redirect.length === 3) {
                return this._makeReq(redirect[2], url, callback);
            }

            return callback(response, body);
        });
    }

    start() {
        this.emit('start');
        this._login(this._username, this._password);
    }

    stop() {
        clearTimeout(this._timerInstance);
        this.emit('stop');
    }

    _poll() {
        this.emit('poll');
        this._timerInstance = setTimeout(this._poll, this._timeout);
        const ssoRegex = /SSO' value='([^']+)/igm;
        const self = this;

        this._makeReq('https://myucgate.canterbury.ac.nz/ShibGateway.aspx?dest=ucsw&page=INTTRNS', 'https://login.canterbury.ac.nz/idp/profile/SAML2/Redirect/SSO', (response, body) => {
            let ssoValue = `SSO=${encodeURIComponent(ssoRegex.exec(body)[1])}`;
            this._makeReq('https://myuc.canterbury.ac.nz/ucsms/sso_login.aspx', 'https://myucgate.canterbury.ac.nz/ShibGateway.aspx?dest=ucsw&page=INTTRNS', ssoValue, () => {
                this._makeReq('https://myuc.canterbury.ac.nz/ucsms/Student/InternalStudentTranscript.aspx', 'https://myucgate.canterbury.ac.nz/ShibGateway.aspx?dest=ucsw&page=INTTRNS', (response, body) => {
                    if (body.indexOf('myUC is temporarily unavailable') >= 0) {
                        if (self._timeout !== self._shortTimeout) {
                            self._timeout = self._shortTimeout;
                            clearTimeout(self._timerInstance);
                            self._timerInstance = setTimeout(self._poll, self._timeout);
                        }
                        return;
                    }

                    const courseRegex = /<td width="122em" valign="top">([A-Z]{4}[0-9]{3}-[0-9]{2}[SW][0-1]?[^<]+)[^>]+>[^>]+>([^<]+)[^>]+>[^>]+>([0-9.]+)[^>]+>[^>]+>([^<]+)<\/td>/igm;
                    let results = {};

                    while (true) {
                        let matches = courseRegex.exec(body);
                        if (matches === null) {
                            break;
                        }

                        results[matches[1]] = {
                            code: matches[1],
                            name: matches[2],
                            points: parseFloat(matches[3]),
                            mark: matches[4]
                        }
                    }
                    if (self._repeat) {
                        const filt = selector(results);
                        const k = Object.keys(filt);
                        if (k.length > 0 && filt[k[0]].mark === 'Enrolled') {
                            return;
                        }
                    }
                    this.results = results;
                    clearTimeout(this._timerInstance);
                    this.emit('results', results);
                });
            });
        });
    }

    _login(username, password) {
        const relayStateRegex = /RelayState" value="([^"]+)/igm,
            samlResponseRegex = /SAMLResponse" value="([^"]+)/igm,
            ssoRegex = /SSO' value='([^']+)/igm;

        this._makeReq('https://myuc.canterbury.ac.nz', () => {
            this._makeReq('https://myucgate.canterbury.ac.nz/ShibGateway.aspx?dest=myuc', 'https://myuc.canterbury.ac.nz/sitsvision/wrd/siw_ipp_lgn.login?process=siw_ipp_app&code1=PROFILE&code2=0001', () => {
                this._makeReq('https://login.canterbury.ac.nz/idp/Authn/UserPassword', 'https://login.canterbury.ac.nz/idp/Authn/UserPassword', 'j_username=' + username + '&j_password=' + password, () => {
                    this._makeReq('https://login.canterbury.ac.nz/idp/profile/SAML2/Redirect/SSO', 'https://login.canterbury.ac.nz/idp/Authn/UserPassword', (response, body) => {
                        try {
                            let relayStateData = encodeURIComponent(htmlEntities.decode(relayStateRegex.exec(body)[1])),
                                samlResponseData = encodeURIComponent(htmlEntities.decode(samlResponseRegex.exec(body)[1])),
                                data = `RelayState=${relayStateData}&SAMLResponse=${samlResponseData}`;

                            this._makeReq('https://myucgate.canterbury.ac.nz/Shibboleth.sso/SAML2/POST', 'https://login.canterbury.ac.nz/idp/profile/SAML2/Redirect/SSO', data, () => {
                                this._makeReq('https://myucgate.canterbury.ac.nz/ShibGateway.aspx?dest=myuc', 'https://login.canterbury.ac.nz/idp/profile/SAML2/Redirect/SSO', (response, body) => {
                                    let ssoValue = `SSO=${encodeURIComponent(ssoRegex.exec(body)[1])}`;

                                    this._makeReq('https://myuc.canterbury.ac.nz/sitsvision/wrd/siw_sso.signon', 'https://login.canterbury.ac.nz/idp/profile/SAML2/Redirect/SSO', ssoValue, () => {
                                        this._poll();
                                    });
                                });
                            });
                        }
                        catch (e) {
                            this.emit('loginFailure', e);
                        }
                    });
                });
            });
        });
    }
}

module.exports = ExamWaiter;
