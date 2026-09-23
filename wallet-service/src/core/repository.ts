import { Model, ModelStatic, WhereOptions, Attributes, CreationAttributes } from 'sequelize';

export class CoreRepository<M extends Model> {
  protected model: ModelStatic<M>;

  constructor(model: ModelStatic<M>) {
    this.model = model;
  }

  public create(data: CreationAttributes<M>) {
    return this.model.create(data);
  }

  public update(filter: WhereOptions<Attributes<M>>, data: object) {
    return this.model.update(data, {
      where: filter 
    });
  }

  public delete(filter: WhereOptions<Attributes<M>>) {
    return this.model.destroy({
      where: filter 
    });
  }

  public getOne(filter: WhereOptions<Attributes<M>>) {
    return this.model.findOne({
      where: filter 
    });
  }

  public getAll(filter: Record<string, unknown>) {
    const { limit = 10, page = 1, ...where } = filter;
    const offset = ((page as number) - 1) * (limit as number);

    return this.model.findAndCountAll({
      where: where as WhereOptions<Attributes<M>>,
      limit: limit as number,
      offset,
      order: [['createdAt', 'DESC']],
    });
  }
}