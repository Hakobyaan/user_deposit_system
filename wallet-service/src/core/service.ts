import { Model } from 'sequelize';
import { CoreRepository } from './repository';
import { Utility } from '../types/request';

export class CoreService<M> {
  protected repository: CoreRepository<Model>;

  constructor(repository: CoreRepository<Model>) {
    this.repository = repository;
  }

  public async create(data: Partial<M>) {
    return this.repository.create(data);
  }

  public async delete(filter: object = {}) {
    return this.repository.delete(filter as Utility);
  }

  public async update(filter: object = {}, data: Partial<M>) {
    return this.repository.update(filter as Utility, data);
  }

  public async getOne(filter: object = {}) {
    return this.repository.getOne(filter as Utility);
  }

  public async getAll(filter: object = {}) {
    return this.repository.getAll(filter as Utility);
  }
  
}