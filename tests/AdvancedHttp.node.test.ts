import { IExecuteFunctions, INode, INodeExecutionData, NodeOperationError } from 'n8n-workflow';
import { AdvancedHttp, isValidUrl, mergeHeaders, convertValue, convertObject } from '../nodes/AdvancedHttp/AdvancedHttp.node';

describe('AdvancedHttp Node', () => {
  let advancedHttp: AdvancedHttp;
  let mockExecuteFunctions: jest.Mocked<IExecuteFunctions>;

  beforeEach(() => {
    advancedHttp = new AdvancedHttp();
    
    // Mock execute functions
    mockExecuteFunctions = {
      getInputData: jest.fn(),
      getNodeParameter: jest.fn(),
      getNode: jest.fn().mockReturnValue({} as INode),
      continueOnFail: jest.fn().mockReturnValue(false),
      helpers: {
        httpRequest: jest.fn(),
      },
    } as any;
    
    // Cast httpRequest to jest mock
    (mockExecuteFunctions.helpers.httpRequest as jest.Mock) = jest.fn();
  });

  describe('Node Description', () => {
    it('should have correct basic properties', () => {
      expect(advancedHttp.description.displayName).toBe('Advanced HTTP Request');
      expect(advancedHttp.description.name).toBe('advancedHttp');
      expect(advancedHttp.description.version).toBe(1);
    });

    it('should have all required properties', () => {
      const properties = advancedHttp.description.properties;
      const propertyNames = properties.map(p => p.name);
      
      expect(propertyNames).toContain('method');
      expect(propertyNames).toContain('url');
      expect(propertyNames).toContain('useDynamicData');
      expect(propertyNames).toContain('headers');
      expect(propertyNames).toContain('body');
      expect(propertyNames).toContain('options');
    });
  });

  describe('execute', () => {
    it('should make a simple GET request', async () => {
      const mockResponse = { data: 'test' };
      mockExecuteFunctions.getInputData.mockReturnValue([{ json: {} }]);
      mockExecuteFunctions.getNodeParameter.mockImplementation((param: string) => {
        switch (param) {
          case 'method': return 'GET';
          case 'url': return 'https://api.example.com';
          case 'useDynamicData': return false;
          case 'options': return {};
          case 'headers.parameter': return [];
          default: return undefined;
        }
      });
      (mockExecuteFunctions.helpers.httpRequest as jest.Mock).mockResolvedValue(mockResponse);

      const result = await advancedHttp.execute.call(mockExecuteFunctions);

      expect(mockExecuteFunctions.helpers.httpRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: 'https://api.example.com',
        timeout: 30000,
        followRedirect: true,
        maxRedirects: 5,
        rejectUnauthorized: true,
        resolveWithFullResponse: false,
      });
      expect(result[0][0].json).toEqual({ data: mockResponse });
    });

    it('should handle POST request with body', async () => {
      const mockResponse = { success: true };
      const requestBody = { name: 'test' };
      
      mockExecuteFunctions.getInputData.mockReturnValue([{ json: {} }]);
      mockExecuteFunctions.getNodeParameter.mockImplementation((param: string) => {
        switch (param) {
          case 'method': return 'POST';
          case 'url': return 'https://api.example.com';
          case 'useDynamicData': return false;
          case 'body': return JSON.stringify(requestBody);
          case 'options': return {};
          case 'headers.parameter': return [];
          default: return undefined;
        }
      });
      (mockExecuteFunctions.helpers.httpRequest as jest.Mock).mockResolvedValue(mockResponse);

      const result = await advancedHttp.execute.call(mockExecuteFunctions);

      expect(mockExecuteFunctions.helpers.httpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          json: requestBody,
        })
      );
    });

    it('should validate invalid URLs', async () => {
      mockExecuteFunctions.getInputData.mockReturnValue([{ json: {} }]);
      mockExecuteFunctions.getNodeParameter.mockImplementation((param: string) => {
        switch (param) {
          case 'method': return 'GET';
          case 'url': return 'not-a-valid-url';
          case 'useDynamicData': return false;
          default: return undefined;
        }
      });

      await expect(advancedHttp.execute.call(mockExecuteFunctions))
        .rejects.toThrow(NodeOperationError);
    });

    it('should handle dynamic data with type conversion', async () => {
      const mockResponse = { success: true };
      const inputData = {
        query: {
          method: 'POST',
          url: 'https://api.example.com',
          body: {
            name: { type: 'string', value: 'test' },
            age: { type: 'integer', value: '25' },
            active: { type: 'boolean', value: 'true' },
            tags: { type: 'array', value: '["tag1", "tag2"]' },
          },
          headers: { 'Content-Type': 'application/json' },
        },
        api_keys: {
          headers: { 'X-API-Key': 'secret' },
        },
      };

      mockExecuteFunctions.getInputData.mockReturnValue([{ json: inputData }]);
      mockExecuteFunctions.getNodeParameter.mockImplementation((param: string) => {
        switch (param) {
          case 'method': return 'GET';
          case 'url': return 'https://default.com';
          case 'useDynamicData': return true;
          case 'options': return {};
          default: return undefined;
        }
      });
      (mockExecuteFunctions.helpers.httpRequest as jest.Mock).mockResolvedValue(mockResponse);

      const result = await advancedHttp.execute.call(mockExecuteFunctions);

      expect(mockExecuteFunctions.helpers.httpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: 'https://api.example.com',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'secret',
          },
          json: {
            name: 'test',
            age: 25,
            active: true,
            tags: ['tag1', 'tag2'],
          },
        })
      );
    });

    it('should handle errors with continueOnFail', async () => {
      const error = new Error('Network error');
      
      mockExecuteFunctions.getInputData.mockReturnValue([{ json: {} }]);
      mockExecuteFunctions.getNodeParameter.mockImplementation((param: string) => {
        switch (param) {
          case 'method': return 'GET';
          case 'url': return 'https://api.example.com';
          case 'useDynamicData': return false;
          case 'options': return {};
          case 'headers.parameter': return [];
          default: return undefined;
        }
      });
      (mockExecuteFunctions.helpers.httpRequest as jest.Mock).mockRejectedValue(error);
      mockExecuteFunctions.continueOnFail.mockReturnValue(true);

      const result = await advancedHttp.execute.call(mockExecuteFunctions);

      expect(result[0][0].json).toEqual({
        error: 'Network error',
        statusCode: 0,
      });
    });
  });

  describe('Type Conversion', () => {
    it('should convert string types correctly', () => {
      const converted = convertValue({ type: 'string', value: 123 });
      expect(converted).toBe('123');
    });

    it('should convert integer types correctly', () => {
      const converted = convertValue({ type: 'integer', value: '42' });
      expect(converted).toBe(42);
    });

    it('should throw error for invalid integer', () => {
      expect(() => {
        convertValue({ type: 'integer', value: 'not-a-number' });
      }).toThrow('Invalid integer value');
    });

    it('should convert boolean types correctly', () => {
      expect(convertValue({ type: 'boolean', value: 'true' })).toBe(true);
      expect(convertValue({ type: 'boolean', value: 'false' })).toBe(false);
      expect(convertValue({ type: 'boolean', value: true })).toBe(true);
    });

    it('should convert array types correctly', () => {
      const converted = convertValue({ 
        type: 'array', 
        value: '[1, 2, 3]' 
      });
      expect(converted).toEqual([1, 2, 3]);
    });

    it('should convert nested objects correctly', () => {
      const input = {
        user: {
          name: { type: 'string', value: 'John' },
          details: {
            age: { type: 'integer', value: '30' },
            active: { type: 'boolean', value: 'true' },
          },
        },
      };

      const converted = convertObject(input);
      
      expect(converted).toEqual({
        user: {
          name: 'John',
          details: {
            age: 30,
            active: true,
          },
        },
      });
    });
  });

  describe('URL Validation', () => {
    it('should accept valid HTTP URLs', () => {
      expect(isValidUrl('http://example.com')).toBe(true);
      expect(isValidUrl('https://example.com')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('ftp://example.com')).toBe(false);
      expect(isValidUrl('')).toBe(false);
    });
  });
});