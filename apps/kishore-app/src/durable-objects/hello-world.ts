import { DurableObject } from 'cloudflare:workers';

export class HelloWorldDO extends DurableObject {
  async sayHello(): Promise<string> {
    return 'hello world';
  }
}
