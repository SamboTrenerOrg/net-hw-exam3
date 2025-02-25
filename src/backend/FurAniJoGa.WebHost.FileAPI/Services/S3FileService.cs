using System.Net;
using Amazon.S3;
using Amazon.S3.Model;

namespace FurAniJoGa.WebHost.FileAPI.Services;

public class S3FileService: IFileService, IDisposable
{
    private const string OriginalFilenameMetadataField = "original-filename";
    private readonly S3FileServiceOptions _options;
    private readonly ILogger<S3FileService> _logger;
    private readonly AmazonS3Client _client;
    
    public S3FileService(S3FileServiceOptions options, ILogger<S3FileService> logger)
    {
        _options = options;
        _logger = logger;
        var config = new AmazonS3Config() {ServiceURL = _options.Host.ToString(), ForcePathStyle = true};
        _client = new AmazonS3Client(options.SecretKey, options.Password, config);
    }
    
    public async Task<Guid> SaveFileToTempBucketAsync(IFormFile file, CancellationToken token = default)
    {
        var fileId = Guid.NewGuid();
        var encodedFilename = Uri.EscapeDataString(file.FileName);
        PutObjectResponse response;
        try
        {
            var putObjectRequest = new PutObjectRequest()
                                   {
                                       BucketName = _options.TempBucket,
                                       InputStream = file.OpenReadStream(),
                                       AutoCloseStream = true,
                                       Key = fileId.ToString(),
                                       ContentType = file.ContentType,
                                       Headers =
                                       {
                                           ContentDisposition = $"attachment; filename=\"{encodedFilename}\"",
                                       }
                                   };
            putObjectRequest.Metadata.Add(OriginalFilenameMetadataField, file.FileName);
            response = await _client.PutObjectAsync(putObjectRequest, token);
        }
        catch (Exception e)
        {
            _logger.LogError(e, "Could not save file. Error occured during PutObjectAsync method call");
            throw;
        }
        _logger.LogInformation("File {FileId} was uploaded successfully", fileId);

        if (( int ) response.HttpStatusCode < 300) 
            return fileId;
        
        _logger.LogWarning("Response from PutObjectAsync returned not success status code: {StatusCode}", response.HttpStatusCode);
        throw new Exception($"Response from PutObjectAsync returned not success status code");
    }

    public async Task<FileContent?> DownloadFileAsync(Guid fileId, CancellationToken token = default)
    {
        var request = new GetObjectRequest()
                      {
                          Key = fileId.ToString(),
                          BucketName = _options.PersistentBucket
                      };
        GetObjectResponse response;
        try
        {
            response = await _client.GetObjectAsync(request, token);
        }
        catch (AmazonS3Exception amazonS3Exception)
        {
            _logger.LogWarning(amazonS3Exception, "Could not get file content by specified key: {FileId}", fileId);
            return null;
        }

        if (response.HttpStatusCode is HttpStatusCode.NotFound)
        {
            return null;
        }

        if ((int)response.HttpStatusCode >= 300)
        {
            _logger.LogWarning("From S3 service returned status code neither 404 nor success: {StatusCode}", 
                               response.HttpStatusCode);
            return null;
        }

        var filename = response.Metadata[OriginalFilenameMetadataField];
        
        return new FileContent()
               {
                   Content = response.ResponseStream,
                   ContentType = response.Headers.ContentType,
                   Filename = filename
               };
    }

    public async Task<File?> GetFileInfoAsync(Guid fileId, CancellationToken token = default)
    {
        var response = await _client.GetObjectMetadataAsync(_options.PersistentBucket, fileId.ToString(), token);
        if ((int)response.HttpStatusCode > 299)
        {
            return null;
        }
        var contentDisposition = response.Headers.ContentDisposition.Split("filename=");
        var filename = contentDisposition.Length > 1
                           ? Uri.UnescapeDataString( contentDisposition[1].Trim('"') )
                           : null;
        
        return new File
               {
                   FileId = fileId,
                   ContentType = response.Headers.ContentType,
                   Filename = filename
               };
    }

    public void Dispose()
    {
        _client.Dispose();
    }
}