const crypto = require('node:crypto');
const MEDIA_OBJECT = require('./MediaObject');

const EncoderTCP = require('./encoderTCP');


module.exports = class ClientObject extends require('node:events')
{

    constructor(netSocket, serverObject) {
        super();

        const $this = this;
        this.__ID = crypto.randomBytes(16).toString('hex');
        this.__destroy = false;
        this.__netSocket = netSocket;
        this.__serverObject = serverObject;
        this.__mediaObject = false;
        this.__headerData = {};
        this.__commandData = {};
        this.__authData = false;
        this.__ip = netSocket.remoteAddress || netSocket.localAddress ||'';

        netSocket.on('close', () => {
            $this.destroy('close');
        });
        netSocket.on('error', (err) => {
            $this.destroy(err);
        });
        netSocket.on('data', (buffer) => {
            const RTSP_command = (name) => {
                $this.emit('RTSP:'+name, buffer.toString(), buffer);
                $this.emit('RTSP:command', name, buffer.toString(), buffer);
                return true;
            }
            const slice = String(buffer.slice(0, 10).toString());
            if(slice.startsWith('OPTIONS'))                 return RTSP_command('OPTIONS');
            if(slice.startsWith('ANNOUNCE'))                return RTSP_command('ANNOUNCE');
            if(slice.startsWith('SETUP'))                   return RTSP_command('SETUP');
            if(slice.startsWith('RECORD'))                  return RTSP_command('RECORD');
            if(slice.startsWith('TEARDOWN'))                return RTSP_command('TEARDOWN');
            if(slice.startsWith('v='))                      return RTSP_command('SDP');
            if(slice.startsWith('DESCRIBE'))                return RTSP_command('DESCRIBE');
            if(slice.startsWith('PLAY'))                    return RTSP_command('PLAY');
            if(slice.startsWith('PAUSE'))                   return RTSP_command('PAUSE');
            if(slice.startsWith('GET_PARAMETER'))           return RTSP_command('GET_PARAMETER');
            if(slice.startsWith('SET_PARAMETER'))           return RTSP_command('SET_PARAMETER');
            if(slice.startsWith('REDIRECT'))                return RTSP_command('REDIRECT');
            if(slice.startsWith('RECORD'))                  return RTSP_command('RECORD');
            if(slice.startsWith('PREROLL'))                 return RTSP_command('PREROLL');
            if(slice.startsWith('ECHO'))                    return RTSP_command('ECHO');
            if(slice.startsWith('GET'))                     return RTSP_command('GET');
            if(slice.startsWith('POST'))                    return RTSP_command('POST');
            if(slice.startsWith('SEARCH'))                  return RTSP_command('SEARCH');
            if(slice.startsWith('X-PLAYLIST-START'))        return RTSP_command('X-PLAYLIST-START');
            if(slice.startsWith('X-RECOMPUTE-INTERVAL'))    return RTSP_command('X-RECOMPUTE-INTERVAL');
            return $this.emit('RTSP:Buffer', buffer);
        });



        $this.on('RTSP:OPTIONS', (body) => {
            if($this.isAuth()){
                if($this.getMediaObject()){
                    return $this.send([
                        'CSeq: ' + $this.getResParam(body, 'CSeq'),
                        'Public: OPTIONS, DESCRIBE, ANNOUNCE, SETUP, TEARDOWN, RECORD, PLAY, PAUSE, ECHO',
                    ]).catch(()=> { });
                }
                return $this.send([
                    'CSeq: ' + $this.getResParam(body, 'CSeq')
                ], 401, 'Unauthorized').catch(()=> { });
            }
            $this.createReqHeaderData(body);
            $this.getServerObject().checkAccess('auth', $this).then((authData) => {
                $this.__authData = typeof authData === 'object' ? authData : {};
                $this.emit('auth', $this.__authData);
                $this.send([
                    'CSeq: ' + $this.getResParam(body, 'CSeq'),
                    'Public: OPTIONS, DESCRIBE, ANNOUNCE, SETUP, TEARDOWN, RECORD, PLAY, ECHO'
                ]).catch(()=> { });
            }).catch((e) => {
                $this.send([
                    'CSeq: ' + $this.getResParam(body, 'CSeq')
                ], 401, e.message || 'PermissionDenied').catch(()=> { });
                $this.destroy(e.message);
            });
        });

        $this.on('RTSP:ANNOUNCE', (body) => {
            if(!$this.isAuth()){
                return $this.send([
                    'CSeq: ' + $this.getResParam(body, 'CSeq')
                ], 401, 'Unauthorized').catch(()=> { });
            }
            $this.createMediaObject(MEDIA_OBJECT.TYPE_PUBLISH).then(() => {
                $this.send([
                    'CSeq: ' + $this.getResParam(body, 'CSeq')
                ]).catch(()=> { });
            }).catch((e) => {
                $this.send([
                    'CSeq: ' + $this.getResParam(body, 'CSeq')
                ], 403, e.message || 'PermissionDenied').catch(()=> { });
            });
        });

        $this.on('RTSP:SDP', (body) => {
            if(!$this.isAuth()){
                return $this.send([], 401, 'Unauthorized').catch(()=> { });
            }
            const mediaObject = $this.getMediaObject();
            if(!mediaObject || !mediaObject.isTypePublish()){
                return $this.send([], 500, 'UnknownMedia').catch(()=> { });
            }
            mediaObject.setSDP(body).catch((e) => {
                return $this.send([], 500, e.message).catch(()=> { });
            });
        });

        $this.on('RTSP:SETUP', (body) => {
            if(!$this.isAuth()){
                return $this.send([
                    'CSeq: ' + $this.getResParam(body, 'CSeq')
                ], 401, 'Unauthorized').catch(()=> { });
            }

            const mediaObject = $this.getMediaObject();
            if(!mediaObject){
                return $this.send([
                    'CSeq: ' + $this.getResParam(body, 'CSeq')
                ], 500, 'InvalidMedia').catch(()=> { });
            }
            mediaObject.rtspSetup($this.getResParam(body, 'Transport')).then((transport) => {
                $this.send([
                    'CSeq: ' + $this.getResParam(body, 'CSeq'),
                    'Transport: '+transport
                ]).catch(()=> { });
            }).catch((e) => {
                return $this.send([
                    'CSeq: ' + $this.getResParam(body, 'CSeq')
                ], 500, e.message).catch(()=> { });
            });
        });

        $this.on('RTSP:TEARDOWN', (body) => {
            if(!$this.isAuth()){
                return $this.send([
                    'CSeq: ' + $this.getResParam(body, 'CSeq')
                ], 401, 'Unauthorized').catch(()=> { });
            }
            $this.destroy('stop');
            $this.send([
                'CSeq: ' + $this.getResParam(body, 'CSeq')
            ]).catch(()=> { });
        });

        $this.on('RTSP:DESCRIBE', (body) => {
            if(!$this.isAuth()){
                return $this.send([
                    'CSeq: ' + $this.getResParam(body, 'CSeq')
                ], 401, 'Unauthorized').catch(()=> { });
            }
            $this.createMediaObject(MEDIA_OBJECT.TYPE_VIEW).then((mediaObject) => {
                mediaObject.generateSDP().then((SDP) => {
                    const buff = Buffer.from(SDP);
                    $this.send([
                        'CSeq: ' + $this.getResParam(body, 'CSeq'),
                        'Accept: application/sdp',
                        'Content-Length: '+buff.length
                    ]).then(() => {
                        $this.write(buff);
                    }).catch(()=> { });
                }).catch((e) => {
                    $this.send([
                        'CSeq: ' + $this.getResParam(body, 'CSeq')
                    ], 500, e.message).catch(()=> { });
                });
            }).catch((e) => {
                $this.send([
                    'CSeq: ' + $this.getResParam(body, 'CSeq')
                ], 403, e.message || 'PermissionDenied').catch(()=> { });
            });

        });

        $this.on('RTSP:RECORD', (body) => {
            if(!$this.isAuth()){
                return $this.send([
                    'CSeq: ' + $this.getResParam(body, 'CSeq')
                ], 401, 'Unauthorized').catch(()=> { });
            }
            const mediaObject = $this.getMediaObject();
            if(!mediaObject){
                return $this.send([
                    'CSeq: ' + $this.getResParam(body, 'CSeq')
                ], 404, 'MediaNotFound').catch(()=> { });
            }
            mediaObject.live(body).then(() => {
                return $this.send([
                    'CSeq: ' + $this.getResParam(body, 'CSeq')
                ]).catch(()=> { });
            }).catch((e) => {
                return $this.send([
                    'CSeq: ' + $this.getResParam(body, 'CSeq')
                ], 500, e.message).catch(()=> { });
            });
        });

        $this.on('RTSP:PLAY', (body) => {
            if(!$this.isAuth()){
                return $this.send([
                    'CSeq: ' + $this.getResParam(body, 'CSeq')
                ], 401, 'Unauthorized').catch(()=> { });
            }
            const mediaObject = $this.getMediaObject();
            if(!mediaObject){
                return $this.send([
                    'CSeq: ' + $this.getResParam(body, 'CSeq')
                ], 404, 'MediaNotFound').catch(()=> { });
            }
            mediaObject.live(body).then(() => {
                return $this.send([
                    'CSeq: ' + $this.getResParam(body, 'CSeq')
                ]).catch(()=> { });
            }).catch((e) => {
                return $this.send([
                    'CSeq: ' + $this.getResParam(body, 'CSeq')
                ], 500, e.message).catch(()=> { });
            });
        });
        $this.on('RTSP:ECHO', (body) => {
            return $this.write(body, true);
        });
        // Encoder TCP
        const encoderTCP = new EncoderTCP();
        encoderTCP.on('data', (buffer) => {
            if($this.__mediaObject){
                $this.__mediaObject.emit('buffer|tcp', buffer);
            }
        });
        $this.on('RTSP:Buffer', (buffer) => {
            if(!$this.__mediaObject) return;
            encoderTCP.append(buffer);
        });
    }

    getID(){
        return this.__ID;
    }

    /**
     *
     * @returns {string}
     */
    getIP(){
        return this.__ip;
    }

    /**
     *
     * @returns {*}
     */
    getNetSocket(){
        return this.__netSocket;
    }

    /**
     *
     * @returns {{}}
     */
    getHeaderData(){
        return typeof this.__headerData === 'object' ? this.__headerData : {};
    }

    /**
     *
     * @returns {{}}
     */
    getHeaderDataVal(name, def){
        return this.getHeaderData()[name] || def;
    }

    getDestroy(){
        return this.__destroy;
    }

    /**
     *
     * @returns {RTSP_SERVER}
     */
    getServerObject(){
        return this.__serverObject;
    }

    /**
     *
     * @param str
     * @param param
     * @param defaultVal
     * @returns {*}
     */
    getReqParam(str, param, defaultVal){
        if(typeof str !== 'string' || typeof param !== 'string') return defaultVal;
        return (str.match(new RegExp(param+': (.+)')) || [])[1] || defaultVal;
    }

    /**
     *
     * @returns {MediaObject|false}
     */
    getMediaObject(){
        return this.__mediaObject || false;
    }

    /**
     *
     * @param str
     * @returns {*|{}}
     */
    createReqHeaderData(str){
        if(typeof this.__headerData !== 'object'){
            this.__headerData = {};
        }
        const data = String(str)
                                .split("\n")
                                .map(function(item) {return item.replace(/[\n\t\r]/g, '');})
                                .filter(function(item) {return item.trim() !== '';});
        const header = (data.shift() || '').split(' ');
        this.__headerData['origin'] = header[1] || '';
        this.__headerData['protocol'] = header[2] || '';
        const parseUrl = this.__headerData['origin'].split('?');
        this.__headerData['url'] = String(parseUrl[0] || '');
        this.__headerData['userAgent'] = this.getReqParam(str, 'User-Agent', '');
        this.__headerData['paramText'] = String(parseUrl[1] || '');
        this.__headerData['name'] = this.__headerData['url'].split(/\/(?=[^\/]+$)/)[1] || '';
        this.__headerData['params'] = {};
        if(this.__headerData['paramText'].length){
            const paramData = this.__headerData['paramText'].split('&');
            for(let i in paramData){
                const date = String(paramData[i] || '').split('=');
                this.__headerData['params'][String(date[0] || '')] = String(date[1] || '');
            }
        }
        return this.__headerData;
    }

    async send(data, code, desc){
        if(this.getDestroy()) throw new Error('destroy');
        if(!this.getNetSocket()) throw new Error('notConnection');
        let dateArray = [];
        dateArray.push('RTSP/1.0 ' + (code || 200) + ' ' + (desc || 'OK'));
        dateArray.push('User-Agent: ' + this.getServerObject().getServerName());
        dateArray = dateArray.concat(data);
        return this.write(dateArray.join('\r\n') + '\r\n\r\n', true);
    }

    /**
     *
     * @param buffer
     * @param isCommand
     * @returns {number}
     */
    write(buffer, isCommand){
        if(this.getDestroy() || !this.getNetSocket()) return 0;
        this.emit('write', buffer, !!isCommand);
        let c = 0;
        try {
            c = this.getNetSocket().write(buffer);
        }catch (e){ }
        return c;
    }

    /**
     *
     * @param request
     * @param param
     * @returns {*|undefined}
     */
    getResParam(request, param){
        return (String(request || '').match(new RegExp(String(param)+': (.+)')) || [])[1] || undefined;
    }

    /**
     *
     * @returns {{}}
     */
    getAuthData(){
        return typeof this.__authData === 'object' ? this.__authData : {};
    }

    /**
     *
     * @returns {boolean}
     */
    isAuth(){
        return this.__authData !== false;
    }

    /**
     *
     * @returns {*|{}}
     */
    getCommandData(){
        return this.__commandData
    }

    /**
     *
     * @param name
     * @param def
     * @returns {*}
     */
    getCommandReqVal(name, def){
        return this.getCommandData()[name] || def;
    }


    /**
     *
     * @param typeMedia
     * @returns {Promise<MediaObject>}
     */
    async createMediaObject(typeMedia){
        if(!this.isAuth()){
            throw new Error('NotAuth');
        }
        const $this = this;
        const MediaObject = new MEDIA_OBJECT(this.getServerObject(), this.getHeaderDataVal('name'), typeMedia);
        MediaObject.setClientObject(this);
        let checkData = {};
        try{
            checkData = await this.getServerObject().registrationMediaObject(MediaObject, $this);
            MediaObject.setResData(checkData);
            $this.__mediaObject = MediaObject;
            MediaObject.on('destroy', () => {
                $this.__mediaObject = false;
                $this.emit('media|destroy', MediaObject);
                $this.destroy(MediaObject.getDestroy());
            })
            $this.emit('media', MediaObject);
            return MediaObject;
        }catch (e){
            MediaObject.destroy(e.message);
            throw e;
        }

    }


    /**
     *
     * @param msg
     * @returns {boolean}
     */
    destroy(msg){
        if(this.__destroy) return false;
        this.__destroy = String(msg || 'destroy');
        this.emit('destroy', this.getDestroy());
        // Close socket
        try{
            const socket = this.getNetSocket();
            if(socket){
                socket.destroy(this.getDestroy());
            }
        }catch (e){
        }
        // Clear all events
        let listEvent = this.eventNames();
        for (let i in listEvent) {
            this.removeAllListeners(listEvent[i]);
        }
        return true;
    }


}