const dgram = require('node:dgram');
const crypto = require('node:crypto');
const parseSDP = require('./parse_sdp');
const TransportUDPObject = require('./TransportUDPObject');



const MediaObject = class MediaObject extends require('node:events'){

    constructor(serverObject, name, type) {
        super();

        if(typeof serverObject !== 'object') throw new Error('InvalidServerObject');
        if(typeof name !== 'string') throw new Error('InvalidName');
        if(typeof type !== 'number' || [MediaObject.TYPE_PUBLISH, MediaObject.TYPE_VIEW].indexOf(type) === -1) throw new Error('InvalidType');

        this.__ID = crypto.randomBytes(16).toString('hex');
        this.__destroy = false;
        this.__resData = {};
        this.__type = type;
        this.__name = name;
        this.__sdp = '';
        this.__sdpInfo = {};
        this.__mediaType = '';
        this.__serverObject = serverObject;
        this.__clientObject = false;
        this.__targetMediaObject = false;
        this.__rtspSetup = [];
        this.__transportList = {};
        const $this = this;
        if(this.isTypePublish()) {
            this.on('buffer|tcp', (buffer) => {
                if($this.getMediaType() === 'TCP'){
                    const mediaType = ($this.getSDPInfoVal('interleavedType', {}) || {})[buffer[1]] || undefined;
                    if(typeof mediaType !== 'undefined'){
                        $this.emit('buffer|udp|' + mediaType, buffer.slice(4));
                    }
                }
            });
        }
    }

    /**
     *
     * @returns {string}
     */
    getID(){
        return this.__ID;
    }

    /**
     *
     * @returns {string}
     */
    getName(){
        return this.__name;
    }


    /**
     *
     * @returns {string}
     */
    getSDP(){
        return typeof this.__sdp === 'string' ? this.__sdp : '';
    }

    /**
     *
     * @returns {{}}
     */
    getSDPInfo(){
        return typeof this.__sdpInfo === 'object' ? this.__sdpInfo : {};
    }

    /**
     *
     * @param name
     * @param def
     * @returns {*}
     */
    getSDPInfoVal(name, def){
        return this.getSDPInfo()[name] || def;
    }

    /**
     *
     * @returns {Array}
     */
    getRtspSetup(){
        return this.__rtspSetup;
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
     * @returns {ClientObject|false}
     */
    getClientObject(){
        return this.__clientObject || false;
    }

    /**
     *
     * @returns {MediaObject|false}
     */
    getTargetMediaObject(){
        return this.__targetMediaObject || false;
    }

    /**
     *
     * @returns {boolean}
     */
    getDestroy(){
        return this.__destroy;
    }

    /**
     *
     * @returns {*}
     */
    getType(){
        return this.__type;
    }

    /**
     *
     * @returns {string}
     */
    getMediaType(){
        return this.__mediaType;
    }

    /**
     *
     * @returns {boolean}
     */
    isTypePublish(){
        return this.getType() === MediaObject.TYPE_PUBLISH;
    }

    /**
     *
     * @returns {boolean}
     */
    isTypeView(){
        return this.getType() === MediaObject.TYPE_VIEW;
    }


    /**
     *
     * @param sdp
     * @returns {MediaObject}
     */
    async setSDP(sdp){
        if(typeof sdp !== 'string'){
            throw new Error('InvalidSDP');
        }
        this.__sdp = String(sdp || '');
        this.__sdpInfo = parseSDP(sdp);
        this.emit('setSDP', this.getSDP());
        return this;
    }

    /**
     *
     * @param transport
     * @returns {Promise<*|string>}
     */
    async rtspSetup(transport){
        if(typeof transport !== 'string' || !transport.length ){
            throw new Error('InvalidTransport');
        }
        const $this = this;
        const countIndex = (this.__rtspSetup.push(transport))-1;
        const mediaType = transport.indexOf('TCP') !== -1 ? 'TCP' : 'UDP';
        const type = this.getSDPInfoVal('mediaType', [])[countIndex];
        const typeData = this.getSDPInfoVal(type);
        if(!type || !typeData){
            throw new Error('InvalidTypeData');
        }
        if(!this.getMediaType().length){
            this.__mediaType = mediaType;
            this.emit('setMediaType', mediaType);
        }
        if(mediaType !== this.getMediaType()){
            throw new Error('InvalidMediaType');
        }

        // View
        if(!this.isTypePublish()){
            // TCP View
            if(mediaType === 'TCP'){
                return 'RTP/AVP/TCP;unicast;mode=record;interleaved='+(typeData['interleaved'] || '0-1');
            }
            // UDP View
            return await (async () => {
                const client_port = (transport.match(/client_port=(\d+-\d+)/) || [])[1] || '';
                await this.createTransport(typeData['type'], parseInt(client_port));
                return transport;
            })();
        }

        // Publish
        const clientObject = this.getClientObject();
        if(!clientObject || clientObject.getDestroy()){
            throw new Error('InvalidClient');
        }
        if(typeof $this.__sdpInfo['interleavedType'] !== 'object'){
            $this.__sdpInfo['interleavedType'] = {};
        }
        // TCP Publish
        if(mediaType === 'TCP'){
            return await (async () => {
                const interleaved = (transport.match(/interleaved=(\d+-\d+)/) || [])[1];
                if(!interleaved){
                    throw new Error('InterleavedError');
                }
                typeData['interleaved'] = interleaved;
                $this.__sdpInfo['interleavedType'][parseInt(interleaved)] = typeData['type'];
                const transportObject = await $this.createTransport(typeData['type']);
                typeData['port'] = transportObject.getPort();
                return transport;
            })();
        }
        // UDP Publish
        return await (async () => {
            const client_port = (transport.match(/client_port=(\d+-\d+)/) || [])[1] || '';

            typeData['interleaved'] =  countIndex === 0 ? '0-1' : '2-3';

            $this.__sdpInfo['interleavedType'][parseInt(typeData['interleaved'])] = typeData['type'];
            const transportObject = await $this.createTransport(typeData['type']);
            typeData['port'] = transportObject.getPort();
            return 'RTP/AVP/UDP;unicast;mode=record;client_port='+client_port+';server_port='+transportObject.getPort()+'-'+transportObject.getPort()+1;
        })();
    }

    /**
     *
     * @returns {string|false}
     */
    async generateSDP() {
        if(!this.isTypeView()) throw new Error('InvalidTypeMedia');
        const targetMediaObject = this.getTargetMediaObject();
        if(!targetMediaObject || targetMediaObject.getSDPInfo().length) throw new Error('InvalidTargetMedia');
        const targetSDPInfo = targetMediaObject.getSDPInfo();
        const SDP = [];
        SDP.push('v=0');
        SDP.push('o=- 0 0 IN IP4 '+this.getServerObject().getHost());
        SDP.push('s='+this.getName());
        if(targetSDPInfo['time']){
            SDP.push('t='+targetSDPInfo['time']);
        }
        SDP.push('a=tool:'+this.getServerObject().getServerName());
        const add = (type, source) => {
            if(source){
                const codec = source['codec'][0];
                if(codec){
                    SDP.push('m='+type+' '+source['port']+' '+source['protocol']+' '+codec['ID']);
                    if(video['bitrate']){
                        SDP.push('b='+source['bitrate']);
                    }
                    SDP.push('a=rtpmap:'+codec['ID']+' '+codec['name']);
                    if(codec['fmtp']){
                        SDP.push('a=fmtp:'+codec['ID']+' '+codec['fmtp']);
                    }
                    if(source['interleaved']){
                        SDP.push('a=interleaved='+source['interleaved']);
                    }
                    SDP.push('a=control:'+source['control']);
                }
            }
        };
        const video = targetSDPInfo['video'];
        add('video', targetSDPInfo['video']);
        add('audio', targetSDPInfo['audio']);
        const textSDP = SDP.join('\n');
        this.setSDP(textSDP);
        return textSDP;
    }

    /**
     *
     * @param clientObject
     * @returns {MediaObject}
     */
    setClientObject(clientObject){
        const $this = this;
        this.__clientObject = clientObject;
        this.emit('setClientObject', this.getClientObject());
        clientObject.once('destroy', (msg) => {
            const oldClientObject = $this.getClientObject();
            $this.__clientObject = false;
            this.emit('setClientObject', false);
            if(oldClientObject === clientObject){
                $this.destroy(msg)
            }
        });
        this.emit('setClientObject', this.getClientObject());
        return this;
    }

    /**
     *
     * @param mediaObject
     * @returns {MediaObject}
     */
    setTargetMediaObject(mediaObject){
        if(!(mediaObject instanceof MediaObject)) throw new Error('InvalidMediaObject');
        this.__targetMediaObject = mediaObject;
        this.emit('setTargetMediaObject', this.getTargetMediaObject());
        return this;
    }

    /**
     *
     * @returns {object}
     */
    getResData(){
        return typeof this.__resData === 'object' ? this.__resData : {};
    }

    /**
     *
     * @param data
     * @returns {MediaObject}
     */
    setResData(data){
        this.__resData = data;
        this.emit('setResData', this.getResData());
        return this;
    }

    /**
     *
     * @param body
     * @returns {Promise<{}>}
     */
    async live(body){
        if(this.getDestroy()){
           throw new Error('MediaDestroy');
        }
        const clientObject = this.getClientObject();
        if(!clientObject || clientObject.getDestroy()){
            throw new Error('InvalidClient');
        }
        const $this = this;
        // Publish
        if(this.isTypePublish()){
            return await (async () => {
                $this.emit('live', $this);
                return {};
            })();

        }

        // View
        const targetMediaObject = this.getTargetMediaObject();
        if(!targetMediaObject || targetMediaObject.getDestroy()){
            throw new Error('InvalidTargetMedia');
        }

        const parseBuffer = (buffer) => {
            if($this.getDestroy()){
                return false;
            }
            clientObject.write(buffer, false);
        };
        // TCP
        if(this.getMediaType() === 'TCP'){
            return await (async () => {
                targetMediaObject.on('buffer|tcp', parseBuffer);
                targetMediaObject.on('destroy', () => $this.destroy('end'));
                $this.emit('live', $this);
                return {};
            })()
        }
        // UDP
        return await (async () => {
            targetMediaObject.on('buffer|udp', parseBuffer);
            targetMediaObject.on('destroy', () => $this.destroy('end'));
            $this.emit('live', $this);
            return {};
        })();
    }

    getTransport(type){
        return this.__transportList[type] || false;
    }

    async createTransport(type, port){
        if(this.__transportList[type]){
            return this.__transportList[type];
        }
        const $this = this;
        const transport = new TransportUDPObject(this, type, port);
        this.__transportList[type] = transport;
        transport.once('destroy', (msg) => {
            $this.emit('transport|destroy', type, transport, msg);
        });
        this.emit('transport|create', type, transport);
        return transport;

    }



    /**
     *
     * @param msg
     * @returns {boolean}
     */
    destroy(msg){
        if(this.__destroy) return false;
        this.__destroy = String(msg || 'destroy');
        const clientObject = this.getClientObject();
        try{
            if(clientObject){
                clientObject.write("TEARDOWN rtsp://"+this.getServerObject().getHost()+":"+this.getServerObject().getPort()+"/"+$this.getName()+" RTSP/1.0\r\nCSeq: 1000\r\nSession: "+clientObject.getID()+"\r\n\r\n", true);
                clientObject.destroy(this.getDestroy());
            }
        }catch (e){ }

        for(let i in this.__transportList){
            try{
                this.__transportList[i].destroy(this.getDestroy());
            }catch (e){}
        }
        this.emit('destroy');
        // Clear all events
        let listEvent = this.eventNames();
        for (let i in listEvent) {
            this.removeAllListeners(listEvent[i]);
        }
        return true;
    }

}

MediaObject.TYPE_PUBLISH = 1;
MediaObject.TYPE_VIEW = 2;


module.exports = MediaObject;