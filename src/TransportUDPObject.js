const dgram = require('node:dgram');
module.exports = class UDP_Transport extends require('node:events'){

    constructor(mediaObject, type, port) {
        super();
        this.__socket = false;
        this.__mediaObject = mediaObject;
        this.__serverObject = mediaObject.getServerObject();
        this.__type = type;
        this.__port = port || 0;

        const $this = this;

        this.__typeData = mediaObject.getSDPInfoVal(type);
        if(!type || typeof this.__typeData !== 'object'){
            throw new Error('InvalidTypeData');
        }

        if(mediaObject.isTypeView()){
            this.view().catch((e) => {
                console.error(e);
                $this.destroy(e.message);
            });
        }else{
            this.publish().catch((e) => {
                $this.destroy(e.message);
            });
        }
    }

    async view(){
        const $this = this;
        const mediaObject = this.getMediaObject();
        const targetMediaObject = this.__mediaObject.getTargetMediaObject();
        const clientObject = this.__mediaObject.getClientObject();
        if(!clientObject){
            throw new Error('ClientNotFound');
        }
        if(!mediaObject){
            throw new Error('TargetMediaNotFound');
        }
        if(!targetMediaObject){
            throw new Error('TargetMediaNotFound');
        }
        if(mediaObject.getMediaType() !== 'UDP'){
            throw new Error('InvalidMediaType');
        }
        // UDP
        return await (async () => {
            this.__socket = dgram.createSocket('udp4');
            const readBuff = (buffer) => {
                if($this.__destroy) return;
                try {
                    $this.__socket.send(buffer, $this.getPort(), clientObject.getIP(), (err) => {});
                }catch (e){ }
            };
            const eventName = 'buffer|udp|'+$this.getType();
            targetMediaObject.on(eventName, readBuff);
            $this.once('destroy', () => {
                targetMediaObject.off(eventName, readBuff);
            });
        })();
    }


    async publish(){
        const $this = this;
        this.__socket = dgram.createSocket('udp4');
        const mediaObject = this.getMediaObject();

        // TCP
        if(mediaObject.getMediaType() === 'TCP'){
            return await (async () => {
                mediaObject.on('buffer|tcp', (buffer) => {
                    //mediaObject.emit('buffer|udp', buffer.slice(4));
                });
            })();
        }

        // UDP
        return await (async () => {
            $this.__port = $this.getServerObject().lockPort();
            $this.__socket.on('error', (err) => {
                console.log('error', err, $this.getPort());
            });

            const interleaved = parseInt($this.getTypeData()['interleaved'] || 0) || 0;
            const tcp_prefix = Buffer.from([36,0,0,0]);

            $this.__socket.on('message', (buffer) => {
                const version = (buffer[0] >> 6) & 0x03;
                const packetType = buffer[1] & 0xFF;
                if (version === 2 && packetType >= 200 && packetType <= 204) {
                    return false;
                }
                tcp_prefix.writeInt8(interleaved, 1);

                tcp_prefix.writeInt16BE(buffer.length, 2);
                mediaObject.emit('buffer|tcp', Buffer.concat([tcp_prefix, buffer]));

                mediaObject.emit('buffer|udp|'+$this.getType(), buffer);
            });
            $this.__socket.bind($this.getPort());


        })();


    }


    getMediaObject(){
        return this.__mediaObject;
    }

    getServerObject(){
        return this.__serverObject;
    }

    getSocket(){
        return this.__socket;
    }

    /**
     *
     * @returns {{}}
     */
    getTypeData(){
        return typeof this.__typeData === 'object' ? this.__typeData : {};
    }

    getType(){
        return this.__type;
    }

    getPort(){
        return this.__port;
    }

    /**
     *
     * @param msg
     * @returns {boolean}
     */
    destroy(msg){
        if(this.__destroy) return false;
        this.__destroy = String(msg || 'destroy');

        // Unlock port
        if(this.__port && this.getMediaObject().isTypePublish()){
            try{
                this.getServerObject().unlockPort(this.__port);
            }catch (e){ }
        }
        // Close socket
        if(this.__socket){
            try{
                this.__socket.close();
            }catch (e){ }
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