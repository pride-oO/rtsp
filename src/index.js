const net = require('node:net');
const CLIENT_OBJECT = require('./ClientObject');

const PORT_LIST = [];

module.exports = class RTSP_SERVER extends require('node:events')
{
    /**
     *
     * @param optionList
     */
    constructor(optionList){
        super();
        const $this = this;
        this.__optionsList = typeof optionList === 'object' ? optionList : {};
        this.__clientList = {};
        this.__mediaList = {};
        this.__mediaPublishList = {};
        this.__accessCallback = {};
        this.__port = parseInt(this.getOptionListVal('port', 455));
        this.__host = String(this.getOptionListVal('host', '127.0.0.1'));


        // Parse list port
        (() => {
            const portList = $this.getOptionListVal('portList', {'start' : 56000, 'end' : 57000});
            if(
                typeof portList !== 'object' ||
                typeof portList.start !== 'number' ||
                typeof portList.end !== 'number' ||
                portList.start < 0 || portList.end < 0 || portList.end <= portList.start
            ){
                throw new Error('InvalidPortList');
            }
            for(let i = portList.start; i <= portList.end; i++){
                $this.unlockPort(i);
            }
        })();

        this.__net = net.createServer((socket) => {
            try{
                const clientObject = new CLIENT_OBJECT(socket, $this);
                socket.clientObject = clientObject;
                $this.__clientList[clientObject.getID()] = clientObject;
                clientObject.on('destroy', () => {
                    delete $this.__clientList[clientObject.getID()];
                    socket.destroy(clientObject.getDestroy());
                });
                socket.on('close', () => {
                    clientObject.destroy('close');
                });
                socket.on('destroy', () => {
                    clientObject.destroy('destroy');
                });
                $this.emit('connect', clientObject);
            }catch (e){
                socket.close('Error#er');
            }
        });
    }

    getPort(){
        return this.__port;
    }

    /**
     *
     * @returns {string}
     */
    getHost(){
        return this.__host;
    }

    /**
     *
     * @returns {[]}
     */
    getFreePortList(){
        return [... PORT_LIST];
    }

    /**
     *
     * @returns {string}
     */
    getServerName(){
        return String(this.getOption('serverName') || 'RTSP SERVER');
    }

    /**
     *
     * @returns {object}
     */
    getOptionList(){
        return typeof this.__optionsList === 'object' ? this.__optionsList : {};
    }

    /**
     *
     * @param name
     * @param dev
     * @returns {*}
     */
    getOptionListVal(name, dev){
        return this.getOptionList()[name] || dev;
    }

    /**
     *
     * @returns {object}
     */
    getMediaList(){
        return typeof this.__mediaList === 'object' ? this.__mediaList : {};
    }

    /**
     *
     * @returns {object}
     */
    getMediaPublishList(){
        return typeof this.__mediaPublishList === 'object' ? this.__mediaPublishList : {};
    }

    /**
     *
     * @returns {number|boolean}
     */
    lockPort(){
        const port = PORT_LIST.shift();
        if(!port || typeof port !== 'number' || port < 1){
            return false;
        }
        this.emit('port|lock', port);
        return port;
    }

    /**
     *
     * @param port
     * @returns {boolean}
     */
    unlockPort(port){
        if(typeof port !== 'number' || port < 1 || PORT_LIST.indexOf(port) !== -1){
            return false;
        }
        PORT_LIST.push(port);
        this.emit('port|unlock', port);
        return true;
    }

    /**
     *
     * @param name
     * @param data
     * @returns {boolean}
     */
    sendErrorEvent(name, data){
        return this.emit('error', name, data || {});
    }

    /**
     *
     * @param argument
     * @returns {*}
     */
    getOption(...argument){
        let val = {... this.getOptionList()};
        for(let i in argument){
            val = typeof val === 'object' ? val[argument[i]] : undefined;
        }
        return val;
    }

    /**
     *
     * @param mediaObject
     * @param clientObject
     * @returns {Promise<*>}
     */
    async registrationMediaObject(mediaObject, clientObject){
        const $this = this;
        const checkMediaObject = () => {
            if(mediaObject.getDestroy()){
                throw new Error(mediaObject.getDestroy());
            }
            if($this.__mediaList[mediaObject.getID()]){
                throw new Error('RepeatIDBug');
            }
            if(!mediaObject.getClientObject() || !clientObject || clientObject.getDestroy()){
                throw new Error('InvalidClientObject');
            }
            const publishMediaObject = $this.getMediaPublishList()[mediaObject.getName()];
            if(mediaObject.isTypePublish()){
                if(publishMediaObject){
                    throw new Error('MediaAlready');
                }
            }else{
                if(!publishMediaObject || publishMediaObject.getDestroy()){
                    throw new Error('MediaNotFound');
                }
            }
        };
        checkMediaObject();
        const publishMediaObject = $this.getMediaPublishList()[mediaObject.getName()];
        if(mediaObject.isTypeView()){
            mediaObject.setTargetMediaObject(publishMediaObject);
        }
        const checkData = await this.checkAccess('media', mediaObject, clientObject);
        checkMediaObject();
        $this.__mediaList[mediaObject.getID()]= mediaObject;
        $this.emit('media', mediaObject);
        if(mediaObject.isTypePublish()){
            $this.__mediaPublishList[mediaObject.getName()] = mediaObject;
            $this.emit('media|publish', mediaObject);
        }
        mediaObject.on('destroy', () => {
            delete $this.__mediaList[mediaObject.getID()];
            if(mediaObject.isTypePublish()){
                delete $this.__mediaPublishList[mediaObject.getName()];
            }
            $this.emit('media|destroy', mediaObject);
        });
        return typeof checkData === 'object' ?  checkData : {};
    }

    /**
     *
     * @param name
     * @param callback
     * @returns {RTSP_SERVER}
     */
    access(name, callback){
        if(typeof name !== 'string') throw new Error('InvalidNameValue');
        if(typeof callback !== 'function') throw new Error('InvalidCallbackValue');
        if(this.__accessCallback[name])  throw new Error('AlreadyAccessValue');
        this.__accessCallback[name] = callback;
        return this;
    };

    /**
     *
     * @returns {Promise<unknown>}
     * @param data
     */
    async checkAccess(... data){
        const name = data.shift();
        const $this = this;
        if(typeof name !== 'string') throw new Error('InvalidNameValue');
        const accessList = Array.isArray(this.getOption('access')) ? this.getOption('access') : [];
        let callback = this.__accessCallback[name];
        if(typeof callback !== 'function'){
            callback = async () => {
                if(accessList.indexOf(name) === -1){
                    return {};
                }
                throw new Error('PermissionDenied');
            };
        }
        return new Promise((resolve, reject) => {
            try{
                const exec = callback.apply($this, data);
                if(typeof exec === 'object' && typeof exec.then === 'function' && typeof exec.catch === 'function'){
                    return exec.then((e) => {
                        resolve(e);
                    }).catch((e) => {
                        reject(e);
                    });
                }
                if(!exec){
                    return reject(new Error('PermissionDenied'));
                }
                return resolve(exec);
            }catch (e){
                return reject(e);
            }
        });

    }

    /**
     *
     * @param port
     * @param host
     * @returns {Promise<Server>}
     */
    async listen(port, host){
        this.__port = port || this.__port;
        this.__host = host || this.__host;
        const $this = this;
        return new Promise((resolve, reject) => {
            try{
                $this.__net.on('error', function (e){
                    $this.emit('error', 'listen', e);
                    reject(e);
                })
                $this.__net.listen($this.getPort(), $this.getHost(), () => {
                    resolve($this);
                    $this.emit('listen', $this);
                });
            }catch (e){
                reject(e);
            }
        });
    }
};
