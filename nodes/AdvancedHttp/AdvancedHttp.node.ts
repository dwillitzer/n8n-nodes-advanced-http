import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
  NodeConnectionType,
} from 'n8n-workflow';

export class AdvancedHttp implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Advanced HTTP Request',
    name: 'advancedHttp',
    icon: 'fa:globe',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["method"]}} {{$parameter["url"]}}',
    description: 'Makes HTTP requests with advanced type conversion and validation',
    defaults: {
      name: 'Advanced HTTP Request',
    },
    inputs: ['main' as NodeConnectionType],
    outputs: ['main' as NodeConnectionType],
    credentials: [
      {
        name: 'httpBasicAuth',
        required: false,
      },
      {
        name: 'httpHeaderAuth',
        required: false,
      },
    ],
    properties: [
      {
        displayName: 'Method',
        name: 'method',
        type: 'options',
        options: [
          { name: 'GET', value: 'GET' },
          { name: 'POST', value: 'POST' },
          { name: 'PUT', value: 'PUT' },
          { name: 'PATCH', value: 'PATCH' },
          { name: 'DELETE', value: 'DELETE' },
          { name: 'HEAD', value: 'HEAD' },
          { name: 'OPTIONS', value: 'OPTIONS' },
        ],
        default: 'GET',
        description: 'The request method to use',
      },
      {
        displayName: 'URL',
        name: 'url',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'https://api.example.com/endpoint',
        description: 'The URL to make the request to',
      },
      {
        displayName: 'Use Dynamic Data',
        name: 'useDynamicData',
        type: 'boolean',
        default: false,
        description: 'Whether to use dynamic data from incoming JSON with type conversion',
      },
      {
        displayName: 'Headers',
        name: 'headers',
        type: 'fixedCollection',
        typeOptions: {
          multipleValues: true,
        },
        displayOptions: {
          show: {
            useDynamicData: [false],
          },
        },
        default: {},
        options: [
          {
            name: 'parameter',
            displayName: 'Header',
            values: [
              {
                displayName: 'Name',
                name: 'name',
                type: 'string',
                default: '',
              },
              {
                displayName: 'Value',
                name: 'value',
                type: 'string',
                default: '',
              },
            ],
          },
        ],
      },
      {
        displayName: 'Body',
        name: 'body',
        type: 'json',
        displayOptions: {
          show: {
            method: ['POST', 'PUT', 'PATCH'],
            useDynamicData: [false],
          },
        },
        default: '{}',
        description: 'The body to send',
      },
      {
        displayName: 'Options',
        name: 'options',
        type: 'collection',
        placeholder: 'Add Option',
        default: {},
        options: [
          {
            displayName: 'Timeout',
            name: 'timeout',
            type: 'number',
            default: 30000,
            description: 'Timeout in milliseconds',
          },
          {
            displayName: 'Validate SSL Certificate',
            name: 'validateSSL',
            type: 'boolean',
            default: true,
            description: 'Whether to validate SSL certificates',
          },
          {
            displayName: 'Follow Redirects',
            name: 'followRedirect',
            type: 'boolean',
            default: true,
            description: 'Whether to follow HTTP redirects',
          },
          {
            displayName: 'Max Redirects',
            name: 'maxRedirects',
            type: 'number',
            default: 5,
            description: 'Maximum number of redirects to follow',
          },
          {
            displayName: 'Return Full Response',
            name: 'fullResponse',
            type: 'boolean',
            default: false,
            description: 'Whether to return the full response including headers and status',
          },
        ],
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const method = this.getNodeParameter('method', i) as string;
        const url = this.getNodeParameter('url', i) as string;
        const useDynamicData = this.getNodeParameter('useDynamicData', i) as boolean;
        const options = this.getNodeParameter('options', i, {}) as any;

        // Validate URL
        if (!isValidUrl(url)) {
          throw new NodeOperationError(this.getNode(), `Invalid URL: ${url}`, { itemIndex: i });
        }

        let requestOptions: any = {
          method,
          url,
          timeout: options.timeout || 30000,
          followRedirect: options.followRedirect !== false,
          maxRedirects: options.maxRedirects || 5,
          rejectUnauthorized: options.validateSSL !== false,
          resolveWithFullResponse: options.fullResponse === true,
        };

        if (useDynamicData) {
          // Process dynamic data from input
          const inputData = items[i].json;
          
          if (inputData.query) {
            const query = typeof inputData.query === 'string' 
              ? JSON.parse(inputData.query) 
              : inputData.query;

            // Override method and URL if provided in query
            if (query.method) requestOptions.method = query.method;
            if (query.url) requestOptions.url = query.url;

            // Process headers
            const apiKeys = inputData.api_keys as any;
            const headers = mergeHeaders(query.headers, apiKeys?.headers);
            if (headers && Object.keys(headers).length > 0) {
              requestOptions.headers = headers;
            }

            // Process body with type conversion
            if (['POST', 'PUT', 'PATCH'].includes(requestOptions.method.toUpperCase())) {
              const convertedBody = convertObject(query.body || {});
              requestOptions.json = convertedBody;
            }
          }
        } else {
          // Use static configuration
          const headers = this.getNodeParameter('headers.parameter', i, []) as any[];
          if (headers.length > 0) {
            requestOptions.headers = headers.reduce((acc: any, header: any) => {
              if (header.name) {
                acc[header.name] = header.value;
              }
              return acc;
            }, {});
          }

          if (['POST', 'PUT', 'PATCH'].includes(method)) {
            const body = this.getNodeParameter('body', i, {}) as any;
            requestOptions.json = typeof body === 'string' ? JSON.parse(body) : body;
          }
        }

        // Make the request
        const response = await this.helpers.httpRequest(requestOptions);

        returnData.push({
          json: options.fullResponse ? response : { data: response },
          pairedItem: i,
        });

      } catch (error: any) {
        if (this.continueOnFail()) {
          returnData.push({
            json: {
              error: error.message || 'Unknown error',
              statusCode: error.statusCode || 0,
            },
            pairedItem: i,
          });
          continue;
        }
        throw error;
      }
    }

    return [returnData];
  }
}

// Helper functions
function isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
}

function mergeHeaders(queryHeaders?: any, apiHeaders?: any): any {
    return { ...queryHeaders, ...apiHeaders };
}

function convertValue(fieldData: any): any {
    if (!fieldData || typeof fieldData !== 'object' || !fieldData.type || fieldData.value === undefined) {
      return fieldData;
    }

    const { type, value } = fieldData;
    
    switch (type.toLowerCase()) {
      case 'string':
        return String(value);
      case 'integer':
        const intVal = parseInt(value, 10);
        if (isNaN(intVal)) throw new Error(`Invalid integer value: ${value}`);
        return intVal;
      case 'number':
        const numVal = parseFloat(value);
        if (isNaN(numVal)) throw new Error(`Invalid number value: ${value}`);
        return numVal;
      case 'boolean':
        return typeof value === 'boolean' ? value : 
               (typeof value === 'string' ? value.toLowerCase() === 'true' : Boolean(value));
      case 'array':
        try {
          return typeof value === 'string' ? JSON.parse(value) : 
                 (Array.isArray(value) ? value : []);
        } catch (e) {
          throw new Error(`Invalid array value: ${value}`);
        }
      case 'object':
        try {
          return typeof value === 'string' ? JSON.parse(value) : 
                 (typeof value === 'object' ? value : {});
        } catch (e) {
          throw new Error(`Invalid object value: ${value}`);
        }
      default:
        throw new Error(`Unknown type: ${type}`);
    }
}

function convertObject(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => convertObject(item));
    
    const converted: any = {};
    for (const [key, value] of Object.entries(obj)) {
      try {
        if (typeof value === 'object' && value !== null && !Array.isArray(value) && 
            (value as any).type && (value as any).value !== undefined) {
          converted[key] = convertValue(value);
        } else if (typeof value === 'object') {
          converted[key] = convertObject(value);
        } else {
          converted[key] = value;
        }
      } catch (error: any) {
        throw new Error(`Error converting field "${key}": ${error.message}`);
      }
    }
    return converted;
}

// Export for testing
export { isValidUrl, mergeHeaders, convertValue, convertObject };