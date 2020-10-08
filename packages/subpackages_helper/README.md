### 子包分包小工具
子包分包小工具用于在构建时，对设置为子包的内容进行打包。

子包分包小工具可以将子包中的Prefab，Texture，Sprite等JSON描述文件及Settings中的资源映射从主包中分离出来。

使用子包分包小工具，可以拆分包体及辅助进行分割模块开发。

当前子包分包小工具有以下几点限制：
1. 只支持打包原生平台
2. 不支持内联所有SpriteFrame、合并图集中的SpriteFrame、MD5 Cache、加密脚本

欢迎一起来不断完善子包分包小工具。

#### 注意
1. 子包间不能互相依赖，子包只能使用主包的通用资源，主包中也不可以引用子包的中资源，除非在子包加载的过程中

2. 要想实现子包的分级依赖，需要在子包的加载顺序上进一步封装

3. 需要在引擎中引入以下自定制代码 
* 在AssetLibray中添加以下两个扩展方法
``` js
var AssetLibrary = {
    addASubPackage: function (options) {
        //添加子包路径映射
        if (options.subpackages) {
            if (cc.loader.subPackPipe) {
                cc.loader.subPackPipe.addMore(options.subpackages);
            } else {
                var subPackPipe = new SubPackPipe(options.subpackages);
                cc.loader.insertPipeAfter(cc.loader.assetLoader, subPackPipe);
                cc.loader.subPackPipe = subPackPipe;
            }

            for(var item in options.subpackages){
                cc.loader.downloader._subpackages[item] = JSON.parse(JSON.stringify(options.subpackages[item]));
            }
        }

        var assetTables = cc.loader._assetTables;

        var assets = options.settings;
        var mountPoint = "assets";

        //添加资源映射
        for (var uuid in assets) {
            var info = assets[uuid];
            var url = info[0];
            var typeId = info[1];
            var type = cc.js._getClassById(typeId);
            if (!type) {
                cc.error('Cannot get', typeId);
                continue;
            }
            // backward compatibility since 1.10
            _uuidToRawAsset[uuid] = new RawAssetEntry(mountPoint + '/' + url, type);
            // init resources
            var ext = cc.path.extname(url);
            if (ext) {
                // trim base dir and extname
                url = url.slice(0, - ext.length);
            }

            var isSubAsset = info[2] === 1;
            assetTables[mountPoint] || (assetTables[mountPoint] = new AssetTable());
            assetTables[mountPoint].add(url, uuid, type, !isSubAsset);
        }
    },
    removeASubPackage: function (options) {
        //移除子包路径映射
        if (options.subpackages && cc.loader.subPackPipe) {
            cc.loader.subPackPipe.clearSome(options.subpackages);
        }

        if (options.subpackages){
            for(var item in options.subpackages){
                delete cc.loader.downloader._subpackages[item];
            }
        }

        var assetTables = cc.loader._assetTables;

        var assets = options.settings;
        var mountPoint = "assets";

        //移除资源映射
        for (var uuid in assets) {
            var info = assets[uuid];
            var url = info[0];
            var typeId = info[1];
            var type = cc.js._getClassById(typeId);
            if (!type) {
                cc.error('Cannot get', typeId);
                continue;
            }
            // backward compatibility since 1.10
            delete _uuidToRawAsset[uuid];
            // init resources
            var ext = cc.path.extname(url);
            if (ext) {
                // trim base dir and extname
                url = url.slice(0, - ext.length);
            }

            var isSubAsset = info[2] === 1;
            if (assetTables[mountPoint]) {
                var path = url;
                path = path.substring(0, path.length - cc.path.extname(path).length);
                assetTables[mountPoint].remove(url, uuid, type);
            }
        }
    }
};

```
* 在SubPackPipe中修改transformURL方法并添加addMore，clearSome两个扩展方法
``` js
SubPackPipe.prototype.transformURL = function (url) {
    var uuid = getUuidFromURL(url);
    if (uuid) {
        var subpackage = _uuidToSubPack[uuid];
        if (subpackage) {
            // replace url of native assets and json assets
            return url.replace('res/raw-assets/', subpackage + 'raw-assets/').replace('res/import/', subpackage + 'import/');
        }
    }
    return url;
};
SubPackPipe.prototype.addMore = function (subpackages) {
    for (var packName in subpackages) {
        var pack = subpackages[packName];
        pack.uuids && pack.uuids.forEach((function (val) {
            _uuidToSubPack[val] = pack.path;
        }));
    }
};
SubPackPipe.prototype.clearSome = function (subpackages) {
    for (var packName in subpackages) {
        var pack = subpackages[packName];
        pack.uuids && pack.uuids.forEach((function (val) {
            delete _uuidToSubPack[val];
        }));
    }
};

```
* 在AssetTable中添加remove方法
``` js
proto.remove = function(path, uuid, type) {
    path = path.substring(0, path.length - cc.path.extname(path).length);

    var exists = this._pathToUuid[path];
    if(exists){
        if (Array.isArray(exists)) {
            var left = exists.filter(function(e){
                return !(e.uuid == uuid && e.type == type);
            });
            if(left.length > 1){
                this._pathToUuid[path] = left;
            } else if(left.length == 1){
                this._pathToUuid[path] = left[0];
            } else {
                delete this._pathToUuid[path];
            }
        } else {
            if(exists.uuid==uuid && exists.type==type){
                delete this._pathToUuid[path];
            }
        }
    }
};

```
* 在cc.js中添加以下方法
``` js
js.unregisterClassByPro = function(prop) {
    for (var i = 0; i < prop.length; i++) {
        var p = prop[i];
        var classId = p[0];
        classId && delete _idToClass[classId];
        var classname = p[1];
        classname && delete _nameToClass[classname];
    }
};

```
* 修改引擎代码，在cocos2d-x/cocos/platform添加CCZipUtils.h
``` c++
#ifndef __CC_MZipUtils_H__
#define __CC_MZipUtils_H__

#include <string>
#include "base/ccMacros.h"
#include "base/CCThreadPool.h"
#include "platform/md5.hpp"

#define M_BUFFER_SIZE    8192
#define MAX_FILENAME   512

NS_CC_BEGIN
/**
 * @addtogroup platform
 * @{
 */

/**
 * 过程回调函数
 */
typedef std::function<void(const long current, const long total)> ProgressCallback;
/**
 * 完成回调函数
 */
typedef std::function<void(const bool result, const std::string message)> FinishCallback;

class CC_DLL MZipUtils
{
public:
    /**
     *  Gets the instance of MZipUtils.
     */
    static MZipUtils* getInstance();

    /**
     *  Destroys the instance of MZipUtils.
     */
    static void destroyInstance();
    /**
     *  The destructor of MZipUtils.
     * @js NA
     * @lua NA
     */
    virtual ~MZipUtils();
    
    /**
     * 解压文件到指定目录
     * 压缩包内的内容会直接解压到目标解压地址中
     * @param srcDir 源文件地址
     * @param tarfullpath 目标解压地址
     * @param zipName 压缩文件名
     * @param progress 过程回调函数
     * @param complete 完成回调函数
     */
    void unZipFile(const std::string &srcDir, const std::string &tarfullpath, const std::string &zipName, const ProgressCallback& progress, const FinishCallback& complete);
    
    /**
     * 计算文件md5值
     * @param filePath 文件地址
     * @param complete 完成回调函数
     */
    void calFileMD5(const std::string &filePath, const FinishCallback& complete);
    
protected:
    /**
     *  The default constructor.
     */
    MZipUtils();
    /**
     *  The singleton pointer of MZipUtils.
     */
    static MZipUtils* s_sharedMZipUtils;
    /**
     * 线程池对象，只有单个线程，解压文件任务只允许顺序执行，以减小系统负担
     */
    ThreadPool* workThread = nullptr;
    
    void unZipFileSync(const std::string &srcDir, const std::string &tarfullpath, const std::string &zipName, const ProgressCallback& progress, const FinishCallback& complete);

    /**
     * 在Cocos线程中执行
     * @param func 执行函数
     */
    void runInCallerThread(const std::function<void()>& func);
    
    /**
     * MD5解析器
     */
    MD5* md5c = nullptr;

};

// end of support group
/** @} */

NS_CC_END

#endif    // __CC_MZipUtils_H__

```
* 修改引擎代码，在cocos2d-x/cocos/platform添加CCZipUtils.cpp
``` c++
#include "platform/CCZipUtils.h"
#ifdef MINIZIP_FROM_SYSTEM
#include <minizip/unzip.h>
#else // from our embedded sources
#include "unzip/unzip.h"
#endif
#include "platform/CCFileUtils.h"
#include "platform/CCApplication.h"
#include "base/CCScheduler.h"

#include <fstream>


NS_CC_BEGIN

MZipUtils* MZipUtils::s_sharedMZipUtils = nullptr;

MZipUtils* MZipUtils::getInstance()
{
    if (s_sharedMZipUtils == nullptr)
    {
        s_sharedMZipUtils = new MZipUtils();
    }
    return s_sharedMZipUtils;
}

void MZipUtils::destroyInstance()
{
    CC_SAFE_DELETE(s_sharedMZipUtils);
}

MZipUtils::MZipUtils()
{
    this->workThread = ThreadPool::newSingleThreadPool();
    this->md5c = new MD5();
}

MZipUtils::~MZipUtils()
{
    CC_SAFE_DELETE(this->workThread);
    CC_SAFE_DELETE(this->md5c);
}

void MZipUtils::unZipFile(const std::string &srcDir, const std::string &tarfullpath, const std::string &zipName, const ProgressCallback &progress, const FinishCallback &complete)
{
    this->workThread->pushTask([this, srcDir, tarfullpath, zipName, progress, complete](int tid){
        this->unZipFileSync(srcDir, tarfullpath, zipName, progress, complete);
    }, ThreadPool::TaskType::IO);
}

void MZipUtils::calFileMD5(const std::string &filePath, const FinishCallback& complete)
{
    this->workThread->pushTask([this, filePath, complete](int tid){
        CCLOG("Cal md5 for %s.", filePath.c_str());
        if(FileUtils::getInstance()->isFileExist(filePath)){
            ifstream fs(filePath);
            if(fs){
                this->md5c->update(fs);
                std::string rmd5 = this->md5c->toString();
                this->md5c->reset();
                this->runInCallerThread([complete, rmd5](){
                    complete(true, rmd5);
                });
            } else {
                this->runInCallerThread([complete](){
                    complete(false, "File can not open.");
                });
            }
        } else {
            this->runInCallerThread([complete](){
                complete(false, "File not exist.");
            });
        }
    }, ThreadPool::TaskType::IO);
}

void MZipUtils::unZipFileSync(const std::string &srcDir, const std::string &tarfullpath, const std::string &zipName, const ProgressCallback& progress, const FinishCallback& complete)
{
    std::string realSrcDir = srcDir, realTarfullpath = tarfullpath, realName = zipName, suffix = ".zip";
    unzFile zipfile = nullptr;
    unz_global_info global_info;
    // Buffer to hold data read from the zip file
    char readBuffer[M_BUFFER_SIZE];
    unz_file_info fileInfo;
    char fileName[MAX_FILENAME];
    bool result = false;
    std::string message;
    
    do
    {
        message = "Source director path should not be null.";
        CC_BREAK_IF(realSrcDir.empty());
        message = "Target director path should not be null.";
        CC_BREAK_IF(realTarfullpath.empty());
        message = "Zip file name should not be null.";
        CC_BREAK_IF(zipName.empty());
        // Check folder suffix
        if (realSrcDir.size() && realSrcDir[realSrcDir.size()-1] != '/'){
            realSrcDir += '/';
        }
        if (realTarfullpath.size() && realTarfullpath[realTarfullpath.size()-1] != '/'){
            realTarfullpath += '/';
        }
        // Check file suffix
        if(!(zipName.size() > suffix.size() && zipName.compare(zipName.size()-suffix.size(),suffix.size(),suffix)==0)){
            realName = zipName + suffix;
        }
        //Check is target folder exist
        if(!FileUtils::getInstance()->isDirectoryExist(realTarfullpath.c_str())){
            FileUtils::getInstance()->createDirectory(realTarfullpath.c_str());
        }

        // Open the zip file
        std::string realPath = realSrcDir + realName;
        zipfile = unzOpen( FileUtils::getInstance()->getSuitableFOpen(realPath).c_str());
        message = "Can not open zip file " + realPath + ".";
        if(!zipfile)CCLOG("%s", message.c_str());
        CC_BREAK_IF(!zipfile);

        // Get info about the zip file
        int ret = unzGetGlobalInfo(zipfile, &global_info);
        message = "Can not read file global info of " + realPath + ".";
        if(UNZ_OK != ret)CCLOG("%s.", message.c_str());
        CC_BREAK_IF(UNZ_OK != ret);

        CCLOG("Start uncompressing %s.", realPath.c_str());

        // Loop to extract all files.
        uLong i;
        uLong total = global_info.number_entry;
        bool isBreak1 = false;
        for (i = 0; i < global_info.number_entry; ++i)
        {
            // Run in caller thread
            runInCallerThread([i, total, progress](){
                progress(i, total);
            });
            // Get info about current file.
            ret = unzGetCurrentFileInfo(zipfile, &fileInfo, fileName, MAX_FILENAME, nullptr, 0, nullptr, 0);
            if(UNZ_OK != ret)
            {
                message = "Can not read file info at index " + std::to_string(i) + ".";
                CCLOG("%s", message.c_str());
                isBreak1 = true;
                break;
            }
            //Get target path
            std::string fullPath = realTarfullpath + fileName;

            // Check if this entry is a directory or a file.
            const size_t filenameLength = strlen(fileName);
            if (fileName[filenameLength - 1] == '/')
            {
                // Entry is a directory, so create it.
                // If the directory exists, it will failed silently.
                bool creatDirResult = FileUtils::getInstance()->createDirectory(fullPath);

                if(!creatDirResult)
                {
                    message = "Can not create directory " + fullPath + ".";
                    CCLOG("%s", message.c_str());
                    isBreak1 = true;
                    break;
                }
            }
            else
            {
                //There are not directory entry in some case.
                //So we need to test whether the file directory exists when uncompressing file entry, if does not exist then create directory
                const std::string fileNameStr(fileName);

                size_t startIndex = 0;

                size_t index = fileNameStr.find("/", startIndex);

                bool isBreak2 = false;
                while (index != std::string::npos)
                {
                    const std::string dir = realTarfullpath + fileNameStr.substr(0, index);

                    FILE *out = fopen(FileUtils::getInstance()->getSuitableFOpen(dir).c_str(), "r");

                    if (!out)
                    {
                        if (!FileUtils::getInstance()->createDirectory(dir))
                        {
                            message = "Can not create directory " + dir + ".";
                            CCLOG("%s", message.c_str());
                            isBreak1 = true;
                            isBreak2 = true;
                            break;
                        }
                        else
                        {
                            CCLOG("Create directory %s.", dir.c_str());
                        }
                    }
                    else
                    {
                        fclose(out);
                    }

                    startIndex = index + 1;

                    index = fileNameStr.find("/", startIndex);
                }
                CC_BREAK_IF(isBreak2);

                // Entry is a file, so extract it. Open current file.
                ret = unzOpenCurrentFile(zipfile);
                if (ret!= UNZ_OK) {
                    message = "Can not open file " + fileNameStr + ".";
                    CCLOG("%s", message.c_str());
                    isBreak1 = true;
                    break;
                }
                // Create a file to store current file.
                FILE *out = fopen( FileUtils::getInstance()->getSuitableFOpen(fullPath).c_str(), "wb");
                if (!out)
                {
                    message = "Can not open destination file " + fullPath + ".";
                    CCLOG("%s", message.c_str());
                    unzCloseCurrentFile(zipfile);
                    isBreak1 = true;
                    break;
                }
                // Write current file content to destinate file.
                int error = UNZ_OK;
                bool isBreak3 = false;
                do
                {
                    error = unzReadCurrentFile(zipfile, readBuffer, M_BUFFER_SIZE);
                    if (error < 0)
                    {
                        message = "Can not read zip file " + fileNameStr + ", error code is " + std::to_string(error) + ".";
                        CCLOG("%s", message.c_str());
                        unzCloseCurrentFile(zipfile);
                        isBreak3 = true;
                        isBreak1 = true;
                        break;
                    }

                    if (error > 0)
                    {
                        fwrite(readBuffer, error, 1, out);
                    }
                } while (error > 0);
                CC_BREAK_IF(isBreak3);

                fclose(out);

                unzCloseCurrentFile(zipfile);
            }

            // Goto next entry listed in the zip file.
            if ((i + 1) < global_info.number_entry)
            {
                // Run in caller thread
                runInCallerThread([i, total, progress](){
                    progress(i+1, total);
                });
                if (unzGoToNextFile(zipfile) != UNZ_OK)
                {
                    message = "Can not read next file.";
                    CCLOG("%s", message.c_str());
                    isBreak1 = true;
                    break;
                }
            }
        }
        
        CC_BREAK_IF(isBreak1);

        runInCallerThread([total, progress](){
            progress(total, total);
        });
        result = true;
        message = "Uncompressing success.";
        CCLOG("Finish uncompressing.");
    } while (0);

    if (zipfile)
    {
        unzClose(zipfile);
    }
    runInCallerThread([complete, result, message](){
        complete(result, message);
    });
}

void MZipUtils::runInCallerThread(const std::function<void()> &func)
{
    auto scheduler = Application::getInstance()->getScheduler();
    scheduler->performFunctionInCocosThread(func);
}

NS_CC_END


```
* 修改引擎代码，在cocos2d-x/cocos/platform添加md5.hpp
``` c++
#ifndef MD5_H
#define MD5_H

#include <string>
#include <fstream>

/* Type define */
typedef unsigned char byte;
typedef unsigned int uint32;

using std::string;
using std::ifstream;

/* MD5 declaration. */
class MD5 {
public:
    MD5();

    MD5(const void *input, size_t length);

    MD5(const string &str);

    MD5(ifstream &in);

    void update(const void *input, size_t length);

    void update(const string &str);

    void update(ifstream &in);

    const byte *digest();

    string toString();

    void reset();

private:
    void update(const byte *input, size_t length);

    void final();

    void transform(const byte block[64]);

    void encode(const uint32 *input, byte *output, size_t length);

    void decode(const byte *input, uint32 *output, size_t length);

    string bytesToHexString(const byte *input, size_t length);

/* class uncopyable */
    MD5(const MD5 &);

    MD5 &operator=(const MD5 &);

private:
    uint32 _state[4]; /* state (ABCD) */
    uint32 _count[2]; /* number of bits, modulo 2^64 (low-order word first) */
    byte _buffer[64]; /* input buffer */
    byte _digest[16]; /* message digest */
    bool _finished;   /* calculate finished ? */

    static const byte PADDING[64]; /* padding for calculate */
    static const char HEX[16];
    enum {
        BUFFER_SIZE = 1024
    };
};

#endif /*MD5_H*/

```
* 修改引擎代码，在cocos2d-x/cocos/platform添加md5.cpp
``` c++

#include "platform/md5.hpp"

using namespace std;

/* Constants for MD5Transform routine. */
#define S11 7
#define S12 12
#define S13 17
#define S14 22
#define S21 5
#define S22 9
#define S23 14
#define S24 20
#define S31 4
#define S32 11
#define S33 16
#define S34 23
#define S41 6
#define S42 10
#define S43 15
#define S44 21


/* F, G, H and I are basic MD5 functions.
*/
#define F(x, y, z) (((x) & (y)) | ((~x) & (z)))
#define G(x, y, z) (((x) & (z)) | ((y) & (~z)))
#define H(x, y, z) ((x) ^ (y) ^ (z))
#define I(x, y, z) ((y) ^ ((x) | (~z)))

/* ROTATE_LEFT rotates x left n bits.
*/
#define ROTATE_LEFT(x, n) (((x) << (n)) | ((x) >> (32-(n))))

/* FF, GG, HH, and II transformations for rounds 1, 2, 3, and 4.
Rotation is separate from addition to prevent recomputation.
*/
#define FF(a, b, c, d, x, s, ac) { \
(a) += F ((b), (c), (d)) + (x) + ac; \
(a) = ROTATE_LEFT ((a), (s)); \
(a) += (b); \
}
#define GG(a, b, c, d, x, s, ac) { \
(a) += G ((b), (c), (d)) + (x) + ac; \
(a) = ROTATE_LEFT ((a), (s)); \
(a) += (b); \
}
#define HH(a, b, c, d, x, s, ac) { \
(a) += H ((b), (c), (d)) + (x) + ac; \
(a) = ROTATE_LEFT ((a), (s)); \
(a) += (b); \
}
#define II(a, b, c, d, x, s, ac) { \
(a) += I ((b), (c), (d)) + (x) + ac; \
(a) = ROTATE_LEFT ((a), (s)); \
(a) += (b); \
}


const byte MD5::PADDING[64] = {0x80};
const char MD5::HEX[16] = {
        '0', '1', '2', '3',
        '4', '5', '6', '7',
        '8', '9', 'a', 'b',
        'c', 'd', 'e', 'f'
};


/* Default construct. */
MD5::MD5() {
    reset();
}

/* Construct a MD5 object with a input buffer. */
MD5::MD5(const void *input, size_t length) {
    reset();
    update(input, length);
}

/* Construct a MD5 object with a string. */
MD5::MD5(const string &str) {
    reset();
    update(str);
}

/* Construct a MD5 object with a file. */
MD5::MD5(ifstream &in) {
    reset();
    update(in);
}

/* Return the message-digest */
const byte *MD5::digest() {

    if (!_finished) {
        _finished = true;
        final();
    }
    return _digest;
}

/* Reset the calculate state */
void MD5::reset() {

    _finished = false;
/* reset number of bits. */
    _count[0] = _count[1] = 0;
/* Load magic initialization constants. */
    _state[0] = 0x67452301;
    _state[1] = 0xefcdab89;
    _state[2] = 0x98badcfe;
    _state[3] = 0x10325476;
}

/* Updating the context with a input buffer. */
void MD5::update(const void *input, size_t length) {
    update((const byte *) input, length);
}

/* Updating the context with a string. */
void MD5::update(const string &str) {
    update((const byte *) str.c_str(), str.length());
}

/* Updating the context with a file. */
void MD5::update(ifstream &in) {

    if (!in) {
        return;
    }

    std::streamsize length;
    char buffer[BUFFER_SIZE];
    while (!in.eof()) {
        in.read(buffer, BUFFER_SIZE);
        length = in.gcount();
        if (length > 0) {
            update(buffer, length);
        }
    }
    in.close();
}

/* MD5 block update operation. Continues an MD5 message-digest
operation, processing another message block, and updating the
context.
*/
void MD5::update(const byte *input, size_t length) {

    uint32 i, index, partLen;

    _finished = false;

/* Compute number of bytes mod 64 */
    index = (uint32) ((_count[0] >> 3) & 0x3f);

/* update number of bits */
    if ((_count[0] += ((uint32) length << 3)) < ((uint32) length << 3)) {
        ++_count[1];
    }
    _count[1] += ((uint32) length >> 29);

    partLen = 64 - index;

/* transform as many times as possible. */
    if (length >= partLen) {

        memcpy(&_buffer[index], input, partLen);
        transform(_buffer);

        for (i = partLen; i + 63 < length; i += 64) {
            transform(&input[i]);
        }
        index = 0;

    } else {
        i = 0;
    }

/* Buffer remaining input */
    memcpy(&_buffer[index], &input[i], length - i);
}

/* MD5 finalization. Ends an MD5 message-_digest operation, writing the
the message _digest and zeroizing the context.
*/
void MD5::final() {

    byte bits[8];
    uint32 oldState[4];
    uint32 oldCount[2];
    uint32 index, padLen;

/* Save current state and count. */
    memcpy(oldState, _state, 16);
    memcpy(oldCount, _count, 8);

/* Save number of bits */
    encode(_count, bits, 8);

/* Pad out to 56 mod 64. */
    index = (uint32) ((_count[0] >> 3) & 0x3f);
    padLen = (index < 56) ? (56 - index) : (120 - index);
    update(PADDING, padLen);

/* Append length (before padding) */
    update(bits, 8);

/* Store state in digest */
    encode(_state, _digest, 16);

/* Restore current state and count. */
    memcpy(_state, oldState, 16);
    memcpy(_count, oldCount, 8);
}

/* MD5 basic transformation. Transforms _state based on block. */
void MD5::transform(const byte block[64]) {

    uint32 a = _state[0], b = _state[1], c = _state[2], d = _state[3], x[16];

    decode(block, x, 64);

/* Round 1 */
    FF (a, b, c, d, x[0], S11, 0xd76aa478); /* 1 */
    FF (d, a, b, c, x[1], S12, 0xe8c7b756); /* 2 */
    FF (c, d, a, b, x[2], S13, 0x242070db); /* 3 */
    FF (b, c, d, a, x[3], S14, 0xc1bdceee); /* 4 */
    FF (a, b, c, d, x[4], S11, 0xf57c0faf); /* 5 */
    FF (d, a, b, c, x[5], S12, 0x4787c62a); /* 6 */
    FF (c, d, a, b, x[6], S13, 0xa8304613); /* 7 */
    FF (b, c, d, a, x[7], S14, 0xfd469501); /* 8 */
    FF (a, b, c, d, x[8], S11, 0x698098d8); /* 9 */
    FF (d, a, b, c, x[9], S12, 0x8b44f7af); /* 10 */
    FF (c, d, a, b, x[10], S13, 0xffff5bb1); /* 11 */
    FF (b, c, d, a, x[11], S14, 0x895cd7be); /* 12 */
    FF (a, b, c, d, x[12], S11, 0x6b901122); /* 13 */
    FF (d, a, b, c, x[13], S12, 0xfd987193); /* 14 */
    FF (c, d, a, b, x[14], S13, 0xa679438e); /* 15 */
    FF (b, c, d, a, x[15], S14, 0x49b40821); /* 16 */

/* Round 2 */
    GG (a, b, c, d, x[1], S21, 0xf61e2562); /* 17 */
    GG (d, a, b, c, x[6], S22, 0xc040b340); /* 18 */
    GG (c, d, a, b, x[11], S23, 0x265e5a51); /* 19 */
    GG (b, c, d, a, x[0], S24, 0xe9b6c7aa); /* 20 */
    GG (a, b, c, d, x[5], S21, 0xd62f105d); /* 21 */
    GG (d, a, b, c, x[10], S22, 0x2441453); /* 22 */
    GG (c, d, a, b, x[15], S23, 0xd8a1e681); /* 23 */
    GG (b, c, d, a, x[4], S24, 0xe7d3fbc8); /* 24 */
    GG (a, b, c, d, x[9], S21, 0x21e1cde6); /* 25 */
    GG (d, a, b, c, x[14], S22, 0xc33707d6); /* 26 */
    GG (c, d, a, b, x[3], S23, 0xf4d50d87); /* 27 */
    GG (b, c, d, a, x[8], S24, 0x455a14ed); /* 28 */
    GG (a, b, c, d, x[13], S21, 0xa9e3e905); /* 29 */
    GG (d, a, b, c, x[2], S22, 0xfcefa3f8); /* 30 */
    GG (c, d, a, b, x[7], S23, 0x676f02d9); /* 31 */
    GG (b, c, d, a, x[12], S24, 0x8d2a4c8a); /* 32 */

/* Round 3 */
    HH (a, b, c, d, x[5], S31, 0xfffa3942); /* 33 */
    HH (d, a, b, c, x[8], S32, 0x8771f681); /* 34 */
    HH (c, d, a, b, x[11], S33, 0x6d9d6122); /* 35 */
    HH (b, c, d, a, x[14], S34, 0xfde5380c); /* 36 */
    HH (a, b, c, d, x[1], S31, 0xa4beea44); /* 37 */
    HH (d, a, b, c, x[4], S32, 0x4bdecfa9); /* 38 */
    HH (c, d, a, b, x[7], S33, 0xf6bb4b60); /* 39 */
    HH (b, c, d, a, x[10], S34, 0xbebfbc70); /* 40 */
    HH (a, b, c, d, x[13], S31, 0x289b7ec6); /* 41 */
    HH (d, a, b, c, x[0], S32, 0xeaa127fa); /* 42 */
    HH (c, d, a, b, x[3], S33, 0xd4ef3085); /* 43 */
    HH (b, c, d, a, x[6], S34, 0x4881d05); /* 44 */
    HH (a, b, c, d, x[9], S31, 0xd9d4d039); /* 45 */
    HH (d, a, b, c, x[12], S32, 0xe6db99e5); /* 46 */
    HH (c, d, a, b, x[15], S33, 0x1fa27cf8); /* 47 */
    HH (b, c, d, a, x[2], S34, 0xc4ac5665); /* 48 */

/* Round 4 */
    II (a, b, c, d, x[0], S41, 0xf4292244); /* 49 */
    II (d, a, b, c, x[7], S42, 0x432aff97); /* 50 */
    II (c, d, a, b, x[14], S43, 0xab9423a7); /* 51 */
    II (b, c, d, a, x[5], S44, 0xfc93a039); /* 52 */
    II (a, b, c, d, x[12], S41, 0x655b59c3); /* 53 */
    II (d, a, b, c, x[3], S42, 0x8f0ccc92); /* 54 */
    II (c, d, a, b, x[10], S43, 0xffeff47d); /* 55 */
    II (b, c, d, a, x[1], S44, 0x85845dd1); /* 56 */
    II (a, b, c, d, x[8], S41, 0x6fa87e4f); /* 57 */
    II (d, a, b, c, x[15], S42, 0xfe2ce6e0); /* 58 */
    II (c, d, a, b, x[6], S43, 0xa3014314); /* 59 */
    II (b, c, d, a, x[13], S44, 0x4e0811a1); /* 60 */
    II (a, b, c, d, x[4], S41, 0xf7537e82); /* 61 */
    II (d, a, b, c, x[11], S42, 0xbd3af235); /* 62 */
    II (c, d, a, b, x[2], S43, 0x2ad7d2bb); /* 63 */
    II (b, c, d, a, x[9], S44, 0xeb86d391); /* 64 */

    _state[0] += a;
    _state[1] += b;
    _state[2] += c;
    _state[3] += d;
}

/* Encodes input (ulong) into output (byte). Assumes length is
a multiple of 4.
*/
void MD5::encode(const uint32 *input, byte *output, size_t length) {

    for (size_t i = 0, j = 0; j < length; ++i, j += 4) {
        output[j] = (byte) (input[i] & 0xff);
        output[j + 1] = (byte) ((input[i] >> 8) & 0xff);
        output[j + 2] = (byte) ((input[i] >> 16) & 0xff);
        output[j + 3] = (byte) ((input[i] >> 24) & 0xff);
    }
}

/* Decodes input (byte) into output (ulong). Assumes length is
a multiple of 4.
*/
void MD5::decode(const byte *input, uint32 *output, size_t length) {

    for (size_t i = 0, j = 0; j < length; ++i, j += 4) {
        output[i] = ((uint32) input[j]) | (((uint32) input[j + 1]) << 8) |
                    (((uint32) input[j + 2]) << 16) | (((uint32) input[j + 3]) << 24);
    }
}

/* Convert byte array to hex string. */
string MD5::bytesToHexString(const byte *input, size_t length) {

    string str;
    str.reserve(length << 1);
    for (size_t i = 0; i < length; ++i) {
        int t = input[i];
        int a = t / 16;
        int b = t % 16;
        str.append(1, HEX[a]);
        str.append(1, HEX[b]);
    }
    return str;
}

/* Convert digest to string value */
string MD5::toString() {
    return bytesToHexString(digest(), 16);
}

```
* 修改引擎代码，在cocos2d-x/cocos/platform/CCFileUtils.h中添加以下代码
``` c++
#include "platform/CCZipUtils.h"
class CC_DLL FileUtils
{
public:
    /**
     * 解压文件到指定目录
     * 压缩包内的内容会直接解压到目标解压地址中
     * @param srcDir 源文件地址
     * @param tarfullpath 目标解压地址
     * @param zipName 压缩文件名
     * @param progress 过程回调函数
     * @param complete 完成回调函数
     */
    virtual void unZipFile(const std::string &srcDir, const std::string &tarfullpath, const std::string &zipName, const ProgressCallback& progress, const FinishCallback& complete);
    
    /**
     * 计算文件md5值
     * @param filePath 文件地址
     * @param complete 完成回调函数
     */
    virtual void calFileMD5(const std::string &filePath, const FinishCallback& complete);
protected:
    /**
     * 压缩工具单例
     */
    MZipUtils* s_shatedZipUtils;
}
```
* 修改引擎代码，在cocos2d-x/cocos/platform/CCFileUtils.cpp中修改及添加以下代码
``` c++
FileUtils::FileUtils()
    : _writablePath("")
{
    s_shatedZipUtils = MZipUtils::getInstance();
}

FileUtils::~FileUtils()
{
    s_shatedZipUtils = nullptr;
    MZipUtils::destroyInstance();
}

void FileUtils::unZipFile(const std::string &srcDir, const std::string &tarfullpath, const std::string &zipName, const ProgressCallback& progress, const FinishCallback& complete)
{
    this->s_shatedZipUtils->unZipFile(srcDir, tarfullpath, zipName, progress, complete);
}

void FileUtils::calFileMD5(const std::string &filePath, const FinishCallback& complete)
{
    this->s_shatedZipUtils->calFileMD5(filePath, complete);
}
```
* 修改引擎代码，在cocos2d-x/cocos/scripting/jsb-bindings/auto/api/jsb_cocos2dx_auto_api.js中添加JSB自动绑定代码
``` js
/**
 * @method calFileMD5
 * @param {String} arg0
 * @param {function} arg1
 */
calFileMD5 : function (
str, 
func 
)
{
},
/**
 * @method unZipFile
 * @param {String} arg0
 * @param {String} arg1
 * @param {String} arg2
 * @param {function} arg3
 * @param {function} arg4
 */
unZipFile : function (
str, 
str, 
str, 
func, 
func 
)
{
},

```
* 修改引擎代码，在cocos2d-x/cocos/scripting/jsb-bindings/auto/jsb_cocos2dx_auto.hpp中添加JSB自动绑定代码
``` c++
SE_DECLARE_FUNC(js_engine_FileUtils_calFileMD5);
SE_DECLARE_FUNC(js_engine_FileUtils_unZipFile);
```
* 修改引擎代码，在cocos2d-x/cocos/scripting/jsb-bindings/auto/jsb_cocos2dx_auto.cpp中添加JSB自动绑定代码
``` c++
static bool js_engine_FileUtils_calFileMD5(se::State& s)
{
    cocos2d::FileUtils* cobj = (cocos2d::FileUtils*)s.nativeThisObject();
    SE_PRECONDITION2(cobj, false, "js_engine_FileUtils_calFileMD5 : Invalid Native Object");
    const auto& args = s.args();
    size_t argc = args.size();
    CC_UNUSED bool ok = true;
    if (argc == 2) {
        std::string arg0;
        std::function<void (bool, std::string)> arg1;
        ok &= seval_to_std_string(args[0], &arg0);
        do {
            if (args[1].isObject() && args[1].toObject()->isFunction())
            {
                se::Value jsThis(s.thisObject());
                se::Value jsFunc(args[1]);
                jsFunc.toObject()->root();
                auto lambda = [=](bool larg0, std::string larg1) -> void {
                    se::ScriptEngine::getInstance()->clearException();
                    se::AutoHandleScope hs;
        
                    CC_UNUSED bool ok = true;
                    se::ValueArray args;
                    args.resize(2);
                    ok &= boolean_to_seval(larg0, &args[0]);
                    ok &= std_string_to_seval(larg1, &args[1]);
                    se::Value rval;
                    se::Object* thisObj = jsThis.isObject() ? jsThis.toObject() : nullptr;
                    se::Object* funcObj = jsFunc.toObject();
                    bool succeed = funcObj->call(args, thisObj, &rval);
                    if (!succeed) {
                        se::ScriptEngine::getInstance()->clearException();
                    }
                };
                arg1 = lambda;
            }
            else
            {
                arg1 = nullptr;
            }
        } while(false)
        ;
        SE_PRECONDITION2(ok, false, "js_engine_FileUtils_calFileMD5 : Error processing arguments");
        cobj->calFileMD5(arg0, arg1);
        return true;
    }
    SE_REPORT_ERROR("wrong number of arguments: %d, was expecting %d", (int)argc, 2);
    return false;
}
SE_BIND_FUNC(js_engine_FileUtils_calFileMD5)

static bool js_engine_FileUtils_unZipFile(se::State& s)
{
    cocos2d::FileUtils* cobj = (cocos2d::FileUtils*)s.nativeThisObject();
    SE_PRECONDITION2(cobj, false, "js_engine_FileUtils_unZipFile : Invalid Native Object");
    const auto& args = s.args();
    size_t argc = args.size();
    CC_UNUSED bool ok = true;
    if (argc == 5) {
        std::string arg0;
        std::string arg1;
        std::string arg2;
        std::function<void (long, long)> arg3;
        std::function<void (bool, std::string)> arg4;
        ok &= seval_to_std_string(args[0], &arg0);
        ok &= seval_to_std_string(args[1], &arg1);
        ok &= seval_to_std_string(args[2], &arg2);
        do {
            if (args[3].isObject() && args[3].toObject()->isFunction())
            {
                se::Value jsThis(s.thisObject());
                se::Value jsFunc(args[3]);
                jsFunc.toObject()->root();
                auto lambda = [=](long larg0, long larg1) -> void {
                    se::ScriptEngine::getInstance()->clearException();
                    se::AutoHandleScope hs;
        
                    CC_UNUSED bool ok = true;
                    se::ValueArray args;
                    args.resize(2);
                    ok &= long_to_seval(larg0, &args[0]);
                    ok &= long_to_seval(larg1, &args[1]);
                    se::Value rval;
                    se::Object* thisObj = jsThis.isObject() ? jsThis.toObject() : nullptr;
                    se::Object* funcObj = jsFunc.toObject();
                    bool succeed = funcObj->call(args, thisObj, &rval);
                    if (!succeed) {
                        se::ScriptEngine::getInstance()->clearException();
                    }
                };
                arg3 = lambda;
            }
            else
            {
                arg3 = nullptr;
            }
        } while(false)
        ;
        do {
            if (args[4].isObject() && args[4].toObject()->isFunction())
            {
                se::Value jsThis(s.thisObject());
                se::Value jsFunc(args[4]);
                jsFunc.toObject()->root();
                auto lambda = [=](bool larg0, std::string larg1) -> void {
                    se::ScriptEngine::getInstance()->clearException();
                    se::AutoHandleScope hs;
        
                    CC_UNUSED bool ok = true;
                    se::ValueArray args;
                    args.resize(2);
                    ok &= boolean_to_seval(larg0, &args[0]);
                    ok &= std_string_to_seval(larg1, &args[1]);
                    se::Value rval;
                    se::Object* thisObj = jsThis.isObject() ? jsThis.toObject() : nullptr;
                    se::Object* funcObj = jsFunc.toObject();
                    bool succeed = funcObj->call(args, thisObj, &rval);
                    if (!succeed) {
                        se::ScriptEngine::getInstance()->clearException();
                    }
                };
                arg4 = lambda;
            }
            else
            {
                arg4 = nullptr;
            }
        } while(false)
        ;
        SE_PRECONDITION2(ok, false, "js_engine_FileUtils_unZipFile : Error processing arguments");
        cobj->unZipFile(arg0, arg1, arg2, arg3, arg4);
        return true;
    }
    SE_REPORT_ERROR("wrong number of arguments: %d, was expecting %d", (int)argc, 5);
    return false;
}
SE_BIND_FUNC(js_engine_FileUtils_unZipFile)

bool js_register_engine_FileUtils(se::Object* obj)
{
    cls->defineFunction("calFileMD5", _SE(js_engine_FileUtils_calFileMD5));
    cls->defineFunction("unZipFile", _SE(js_engine_FileUtils_unZipFile));
}
```
* 修改引擎代码，在cocos2d-x/build/libcocos2d.vcxproj中添加以下代码
``` xml
<?xml version="1.0" encoding="utf-8"?>
<Project DefaultTargets="Build" ToolsVersion="15.0" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <ItemGroup>
    <ClCompile Include="..\cocos\platform\CCZipUtils.cpp" />
    <ClCompile Include="..\cocos\platform\md5.cpp" />
  </ItemGroup>
  <ItemGroup>
    <ClInclude Include="..\cocos\platform\CCZipUtils.h" />
    <ClInclude Include="..\cocos\platform\md5.h" />
  </ItemGroup>
</Project>
```
* 修改引擎代码，在cocos2d-x/build/libcocos2d.vcxproj.filters中添加以下代码
``` xml
<?xml version="1.0" encoding="utf-8"?>
<Project ToolsVersion="4.0" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <ItemGroup>
    <ClCompile Include="..\cocos\platform\CCZipUtils.cpp">
      <Filter>platform</Filter>
    </ClCompile>
    <ClCompile Include="..\cocos\platform\md5.cpp">
      <Filter>platform</Filter>
    </ClCompile>
  </ItemGroup>
  <ItemGroup>
    <ClInclude Include="..\cocos\platform\CCZipUtils.h">
      <Filter>platform</Filter>
    </ClInclude>
    <ClInclude Include="..\cocos\platform\md5.h">
      <Filter>platform</Filter>
    </ClInclude>
  </ItemGroup>
</Project>
```
* 修改引擎代码，在cocos2d-x/cocos/Android.mk中添加以下代码
``` makefile
LOCAL_SRC_FILES := \
platform/CCZipUtils.cpp \
platform/md5.cpp \
```
* 修改引擎代码，
在ios项目中添加新添加的文件CCZipUitls.h、CCZipUitls.cpp、md5.hpp、md5.cpp, 即修改cocos2d-x/build/cocos2d_libs.xcodeproj/project.pbxproj



