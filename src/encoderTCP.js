module.exports = class encoderTCP extends require('node:events')
{
    constructor()
    {
        super();
        this.__queueBuffer = [];
        this.__readyBuffer = false;
        this.__ready = false;
        const $this = this;
        this.on('append', () => {
            if(!$this.__ready){
                $this.ready().catch((e) => { });
            }
        });
        this.on('ready', () => {
            if($this.__queueBuffer.length > 0){
                $this.ready().catch((e) => { });
            }
        });
    }



    async searchPack(buffer)
    {
        if(!Buffer.isBuffer(buffer))return false;
        let TcpRTPstart = buffer.indexOf(0x24);
        if(TcpRTPstart === -1 || buffer.length < 4) return false;

        if(TcpRTPstart !== 0){
            if(this.__readyBuffer){
                const con = [this.__readyBuffer, buffer];
                this.__readyBuffer = false;
                return await this.searchPack(Buffer.concat(con));
            }
            this.emit('skip', buffer.slice(0, TcpRTPstart), 'invalidStartPack');
            buffer = buffer.slice(TcpRTPstart);
            if(buffer.length < 4) return false;
            TcpRTPstart = 0;
        }
        let packageLength;
        try{
            packageLength = buffer.readIntBE(TcpRTPstart+2, 2);
        }catch (e){ }

        // Invalid packege length, skip
        if(!packageLength || typeof packageLength !== 'number' || packageLength < 0){
            buffer[0] = 0x00;
            let skipEnd = buffer.indexOf(0x24);
            if(skipEnd === -1) skipEnd = buffer.length;
            buffer[0] = 0x24;
            this.emit('skip', buffer.slice(0, skipEnd), 'invalidLength');
            return await this.searchPack(buffer.slice(skipEnd));
        }
        const end = packageLength+4;
        if(buffer.length < end){
            this.__readyBuffer = buffer;
            return true;
        }
        this.emit('data', buffer.slice(0, end));

        buffer = buffer.slice(end);
        if(buffer.length < 4) return true;

       return await this.searchPack(buffer);

    }

    async ready(){
        if(this.__ready){
            return false;
        }
        const $this = this;
        $this.__ready = true;
        let buffer = $this.__queueBuffer.shift();
        this.searchPack(buffer).catch((e) => {
            $this.emit('error', e, buffer);
        }).finally(() => {
            $this.__ready = false;
            $this.emit('ready');
        });

    }

    append(buffer)
    {
        if(!buffer || !Buffer.isBuffer(buffer)) return false;
        this.__queueBuffer.push(buffer);
        this.emit('append', buffer);
        return true;
    }



}